import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { findOverlaps } from '../../geometry/furniture-geometry';
import { formatArea, formatLength, gridSize, majorGridSize } from '../../geometry/units';
import { add, angleDeg, dist, pointInPolygon, rectCorners, scale } from '../../geometry/vec';
import { CATALOG, catalogItem, isRoundShape, shade, symbolParts } from '../../model/catalog';
import { Point } from '../../model/plan.model';
import { EditorActions } from '../../state/editor-actions';
import { EditorStore, MAX_ZOOM, MIN_ZOOM, ToolId } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { OpeningTool } from '../tools/opening.tool';
import { PanTool } from '../tools/pan.tool';
import { SelectTool } from '../tools/select.tool';
import { Hit, HitKind, Tool, ToolContext, ToolPointerEvent } from '../tools/tool';
import { WallTool } from '../tools/wall.tool';

export const FURNITURE_DRAG_MIME = 'application/x-flip-furniture';
const SNAP_PX = 10;

@Component({
  selector: 'app-plan-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-canvas.html',
  styleUrl: './plan-canvas.css',
  host: {
    '(window:keydown)': 'onWindowKey($event, true)',
    '(window:keyup)': 'onWindowKey($event, false)',
    '(window:blur)': 'spaceDown.set(false)',
  },
})
export class PlanCanvas {
  protected readonly planStore = inject(PlanStore);
  protected readonly editor = inject(EditorStore);
  private readonly actions = inject(EditorActions);
  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly size = signal({ width: 0, height: 0 });
  protected readonly spaceDown = signal(false);
  protected readonly panning = signal(false);
  private panLast: Point | null = null;
  private fitted = false;

  private readonly ctx: ToolContext = {
    plan: this.planStore,
    editor: this.editor,
    tolerance: () => SNAP_PX / this.editor.viewport().zoom,
    grid: () => gridSize(this.planStore.units()),
    setTool: (id) => this.editor.tool.set(id),
  };

  private readonly tools: Record<ToolId, Tool> = {
    select: new SelectTool(this.ctx),
    wall: new WallTool(this.ctx),
    door: new OpeningTool(this.ctx, 'door'),
    window: new OpeningTool(this.ctx, 'window'),
    pan: new PanTool(this.ctx),
  };

  protected readonly activeTool = computed(() => this.tools[this.editor.tool()]);
  readonly hint = computed(() => this.activeTool().hint);

  protected readonly cursor = computed(() => {
    if (this.panning()) return 'grabbing';
    if (this.spaceDown()) return 'grab';
    return this.activeTool().cursor;
  });

  // ---------------------------------------------------------------------------
  // View models
  // ---------------------------------------------------------------------------

  protected readonly zoom = computed(() => this.editor.viewport().zoom);
  /** One screen pixel in world units. */
  protected readonly px = computed(() => 1 / this.zoom());
  protected readonly transform = computed(() => {
    const v = this.editor.viewport();
    return `translate(${v.x} ${v.y}) scale(${v.zoom})`;
  });
  protected readonly units = this.planStore.units;

  protected readonly grid = computed(() => {
    const v = this.editor.viewport();
    const { width, height } = this.size();
    const units = this.units();
    const x0 = -v.x / v.zoom;
    const y0 = -v.y / v.zoom;
    const x1 = (width - v.x) / v.zoom;
    const y1 = (height - v.y) / v.zoom;
    const lines = (step: number) => {
      if (step * v.zoom < 6) return '';
      let d = '';
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) d += `M${x} ${y0}V${y1}`;
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) d += `M${x0} ${y}H${x1}`;
      return d;
    };
    let major = majorGridSize(units);
    while (major * v.zoom < 12) major *= units === 'imperial' ? 5 : 10;
    return { minor: lines(gridSize(units)), major: lines(major) };
  });

  protected readonly rooms = computed(() => {
    const units = this.units();
    const sel = this.editor.selectedIds();
    return this.planStore.rooms().map((r) => ({
      key: r.key,
      points: r.polygon.map((p) => `${p.x},${p.y}`).join(' '),
      fill: r.floorColor,
      selected: sel.has(`room:${r.key}`),
      label: r.label,
      name: r.name,
      area: formatArea(r.area, units),
    }));
  });

  protected readonly walls = computed(() => {
    const sel = this.editor.selectedIds();
    const hover = this.editor.hover();
    return this.planStore.segments().map((s) => ({
      id: s.wall.id,
      x1: s.a.x,
      y1: s.a.y,
      x2: s.b.x,
      y2: s.b.y,
      t: s.wall.thickness,
      selected: sel.has(`wall:${s.wall.id}`),
      hovered: hover?.kind === 'wall' && hover.id === s.wall.id,
    }));
  });

  /** Accent wall faces, drawn as a colored band along the inside of that face. */
  protected readonly accents = computed(() => {
    const px = this.px();
    const result: { key: string; x1: number; y1: number; x2: number; y2: number; width: number; color: string }[] = [];
    for (const s of this.planStore.segments()) {
      const colors = s.wall.colors;
      if (!colors) continue;
      for (const side of ['front', 'back'] as const) {
        const color = colors[side];
        if (!color) continue;
        const width = s.wall.thickness * 0.38;
        const off = scale(s.normal, (side === 'front' ? 1 : -1) * (s.wall.thickness / 2 - width / 2 - 1.5 * px));
        result.push({ key: `${s.wall.id}:${side}`, x1: s.a.x + off.x, y1: s.a.y + off.y, x2: s.b.x + off.x, y2: s.b.y + off.y, width, color });
      }
    }
    return result;
  });

  protected readonly openings = computed(() => {
    const segs = this.planStore.segmentById();
    const sel = this.editor.selectedIds();
    const px = this.px();
    const result = [];
    for (const o of this.planStore.plan().openings) {
      const seg = segs.get(o.wallId);
      if (!seg) continue;
      const c = add(seg.a, scale(seg.dir, o.offset));
      const t = seg.wall.thickness;
      const w = o.width;
      const hingeX = o.swing === 'right' ? w / 2 : -w / 2;
      const sgn = o.flip ? -1 : 1;
      const tipY = sgn * (t / 2 + w);
      const otherX = -hingeX;
      const sweep = -sgn * w * (otherX - hingeX) > 0 ? 1 : 0;
      result.push({
        id: o.id,
        kind: o.kind,
        transform: `translate(${c.x} ${c.y}) rotate(${angleDeg(seg.dir)})`,
        w,
        t,
        gapH: t + 2 * px,
        leaf: `M${hingeX} ${(sgn * t) / 2}L${hingeX} ${tipY}`,
        arc: `M${hingeX} ${tipY}A${w} ${w} 0 0 ${sweep} ${otherX} ${(sgn * t) / 2}`,
        selected: sel.has(`opening:${o.id}`),
      });
    }
    return result;
  });

  private readonly overlaps = computed(() => findOverlaps(this.planStore.plan().furniture, this.planStore.segments()));

  protected readonly furniture = computed(() => {
    const sel = this.editor.selectedIds();
    const overlaps = this.overlaps();
    const zoom = this.zoom();
    const items = this.planStore.plan().furniture.map((f) => {
      const c = catalogItem(f.catalogId);
      const label = f.label || c.name;
      return {
        id: f.id,
        transform: `translate(${f.x} ${f.y}) rotate(${f.rotation})`,
        w: f.width,
        d: f.depth,
        fill: f.color,
        stroke: shade(f.color, -0.45),
        round: isRoundShape(c.shape),
        floor: !!c.floorLayer,
        parts: symbolParts(c.shape, f.width, f.depth).map((p) => ({
          ...p,
          fill: 'tone' in p && p.tone !== undefined ? shade(f.color, p.tone) : 'none',
        })),
        label,
        showLabel: f.width * zoom > label.length * 6.5 + 8 && f.depth * zoom > 16,
        // Keep text upright regardless of item rotation.
        labelRotate: -f.rotation,
        selected: sel.has(`furniture:${f.id}`),
        overlap: overlaps.has(f.id),
      };
    });
    // Rugs first so other furniture draws on top of them.
    return [...items.filter((i) => i.floor), ...items.filter((i) => !i.floor)];
  });

  protected readonly nodes = computed(() => {
    if (this.editor.tool() !== 'select') return [];
    const sel = this.editor.selectedIds();
    return this.planStore.plan().nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, selected: sel.has(`node:${n.id}`) }));
  });

  protected readonly dimensions = computed(() => {
    const units = this.units();
    const zoom = this.zoom();
    const px = this.px();
    const rooms = this.planStore.rooms();
    return this.planStore
      .segments()
      .filter((s) => s.length * zoom > 48)
      .map((s) => {
        const mid = scale(add(s.a, s.b), 0.5);
        const probe = add(mid, scale(s.normal, s.wall.thickness / 2 + 4));
        const inside = rooms.some((r) => pointInPolygon(probe, r.polygon));
        const side = inside ? -1 : 1;
        const pos = add(mid, scale(s.normal, side * (s.wall.thickness / 2 + 11 * px)));
        let angle = angleDeg(s.dir);
        if (angle > 90 || angle <= -90) angle += 180;
        return { id: s.wall.id, x: pos.x, y: pos.y, angle, text: formatLength(s.length, units) };
      });
  });

  protected readonly handles = computed(() => {
    const single = this.editor.singleSelection();
    if (single?.kind !== 'furniture' || this.editor.tool() !== 'select') return null;
    const f = this.planStore.plan().furniture.find((x) => x.id === single.id);
    if (!f) return null;
    const px = this.px();
    return {
      id: f.id,
      transform: `translate(${f.x} ${f.y}) rotate(${f.rotation})`,
      w: f.width,
      d: f.depth,
      size: 8 * px,
      rotateY: -f.depth / 2 - 26 * px,
      text: `${formatLength(f.width, this.units())} × ${formatLength(f.depth, this.units())}`,
      textY: f.depth / 2 + 16 * px,
      textRotate: -f.rotation,
    };
  });

  protected readonly overlay = computed(() => {
    const o = this.editor.overlay();
    const units = this.units();
    const px = this.px();
    const chain = o.wallChain ?? [];
    const cursor = o.wallCursor ?? null;
    const last = chain.at(-1);
    let live: { x1: number; y1: number; x2: number; y2: number; label: string; lx: number; ly: number } | null = null;
    if (last && cursor && dist(last, cursor) > 0.5) {
      const mid = scale(add(last, cursor), 0.5);
      live = { x1: last.x, y1: last.y, x2: cursor.x, y2: cursor.y, label: formatLength(dist(last, cursor), units), lx: mid.x, ly: mid.y - 10 * px };
    }
    let preview: { transform: string; w: number; t: number } | null = null;
    if (o.openingPreview) {
      const seg = this.planStore.segmentById().get(o.openingPreview.wallId);
      if (seg) {
        const c = add(seg.a, scale(seg.dir, o.openingPreview.offset));
        preview = { transform: `translate(${c.x} ${c.y}) rotate(${angleDeg(seg.dir)})`, w: o.openingPreview.width, t: seg.wall.thickness };
      }
    }
    const box = o.box
      ? {
          x: Math.min(o.box.a.x, o.box.b.x),
          y: Math.min(o.box.a.y, o.box.b.y),
          w: Math.abs(o.box.a.x - o.box.b.x),
          h: Math.abs(o.box.a.y - o.box.b.y),
        }
      : null;
    const measures = (o.measures ?? []).map((m) => {
      const mid = scale(add(m.from, m.to), 0.5);
      return { ...m, text: formatLength(dist(m.from, m.to), units), mx: mid.x, my: mid.y };
    });
    return {
      chain: chain.length > 1 ? 'M' + chain.map((p) => `${p.x} ${p.y}`).join('L') : '',
      chainStart: chain[0] ?? null,
      live,
      cursor: this.editor.tool() === 'wall' ? cursor : null,
      snap: o.snapPoint ?? null,
      guides: o.guides ?? [],
      preview,
      box,
      measures,
    };
  });

  /** Typed wall length bubble, positioned in screen space next to the cursor. */
  protected readonly typedBubble = computed(() => {
    const o = this.editor.overlay();
    if (!o.typedLength || !o.wallCursor) return null;
    const v = this.editor.viewport();
    return { text: o.typedLength, x: o.wallCursor.x * v.zoom + v.x + 16, y: o.wallCursor.y * v.zoom + v.y + 16 };
  });

  protected readonly isEmpty = computed(() => {
    const p = this.planStore.plan();
    return p.walls.length === 0 && p.furniture.length === 0 && !(this.editor.overlay().wallChain?.length);
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const el = this.svgRef().nativeElement;
      const ro = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        this.size.set({ width, height });
        this.actions.canvasSize.set({ width, height });
        if (!this.fitted && width > 0) {
          this.fitted = true;
          this.fitToContent();
        }
      });
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
    });

    // Switching tools abandons whatever the previous tool was doing.
    let previous: Tool | null = null;
    effect(() => {
      const tool = this.activeTool();
      untracked(() => {
        if (previous && previous !== tool) {
          previous.cancel();
          this.editor.clearOverlay();
        }
        previous = tool;
      });
    });

    effect(() => {
      if (this.editor.fitRequest() > 0) untracked(() => this.fitToContent());
    });
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private toToolEvent(e: PointerEvent | MouseEvent, withHit = true): ToolPointerEvent {
    const rect = this.svgRef().nativeElement.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return {
      screen,
      world: this.screenToWorld(screen),
      hit: withHit ? readHit(e.target) : null,
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey || e.metaKey,
      button: e.button,
    };
  }

  private screenToWorld(p: Point): Point {
    const v = this.editor.viewport();
    return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom };
  }

  protected onPointerDown(e: PointerEvent): void {
    const svg = this.svgRef().nativeElement;
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (e.button === 1 || (e.button === 0 && (this.spaceDown() || this.editor.tool() === 'pan'))) {
      e.preventDefault();
      this.panning.set(true);
      this.panLast = { x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const ev = this.toToolEvent(e);
    svg.setPointerCapture(e.pointerId);
    this.activeTool().onPointerDown(ev);
  }

  protected onPointerMove(e: PointerEvent): void {
    if (this.panning() && this.panLast) {
      const dx = e.clientX - this.panLast.x;
      const dy = e.clientY - this.panLast.y;
      this.panLast = { x: e.clientX, y: e.clientY };
      this.editor.viewport.update((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
    const captured = this.svgRef().nativeElement.hasPointerCapture(e.pointerId);
    const ev = this.toToolEvent(e, !captured);
    this.editor.cursorWorld.set(ev.world);
    this.activeTool().onPointerMove(ev);
  }

  protected onPointerUp(e: PointerEvent): void {
    const svg = this.svgRef().nativeElement;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    if (this.panning()) {
      this.panning.set(false);
      this.panLast = null;
      return;
    }
    if (e.button !== 0) return;
    this.activeTool().onPointerUp(this.toToolEvent(e, false));
  }

  protected onPointerLeave(): void {
    this.editor.cursorWorld.set(null);
    this.editor.hover.set(null);
  }

  protected onDoubleClick(e: MouseEvent): void {
    this.activeTool().onDoubleClick?.(this.toToolEvent(e));
  }

  protected onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.svgRef().nativeElement.getBoundingClientRect();
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomAt(anchor, Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)));
  }

  zoomBy(factor: number): void {
    const { width, height } = this.size();
    this.zoomAt({ x: width / 2, y: height / 2 }, factor);
  }

  private zoomAt(anchor: Point, factor: number): void {
    this.editor.viewport.update((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const world = { x: (anchor.x - v.x) / v.zoom, y: (anchor.y - v.y) / v.zoom };
      return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom };
    });
  }

  fitToContent(): void {
    const { width, height } = this.size();
    if (!width || !height) return;
    const plan = this.planStore.plan();
    const pts: Point[] = [
      ...plan.nodes,
      ...plan.furniture.flatMap((f) => rectCorners(f, f.width, f.depth, f.rotation)),
    ];
    if (!pts.length) {
      // Empty plan: show about 30 ft / 9 m around the origin.
      const zoom = Math.min(width, height) / 900;
      this.editor.viewport.set({ zoom, x: width / 2 - 450 * zoom, y: height / 2 - 450 * zoom });
      return;
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX || 100;
    const h = Math.max(...ys) - minY || 100;
    const pad = 64;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((width - pad * 2) / w, (height - pad * 2) / h)));
    this.editor.viewport.set({ zoom, x: width / 2 - (minX + w / 2) * zoom, y: height / 2 - (minY + h / 2) * zoom });
  }

  protected onWindowKey(e: KeyboardEvent, down: boolean): void {
    if (e.code !== 'Space' || isTypingTarget(e.target)) return;
    if (down && !e.repeat) e.preventDefault();
    this.spaceDown.set(down);
  }

  /** Called by the editor page's keyboard handler before global shortcuts. */
  handleToolKey(e: KeyboardEvent): boolean {
    return this.activeTool().onKeyDown?.(e) ?? false;
  }

  protected onDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types.includes(FURNITURE_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDrop(e: DragEvent): void {
    const id = e.dataTransfer?.getData(FURNITURE_DRAG_MIME);
    if (!id || !CATALOG.some((c) => c.id === id)) return;
    e.preventDefault();
    this.actions.placeFurniture(id, this.toToolEvent(e, false).world);
  }
}

function readHit(target: EventTarget | null): Hit | null {
  const el = (target as Element | null)?.closest?.('[data-kind]');
  if (!el) return null;
  return {
    kind: el.getAttribute('data-kind') as HitKind,
    id: el.getAttribute('data-id') ?? '',
    handle: el.getAttribute('data-handle') ?? undefined,
  };
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

