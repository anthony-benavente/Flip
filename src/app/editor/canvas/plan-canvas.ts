import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { itemElevation } from '../../geometry/elevation';
import { findOverlaps } from '../../geometry/furniture-geometry';
import { gridSize } from '../../geometry/units';
import { rectCorners } from '../../geometry/vec';
import { fitViewport, screenToWorld, worldToScreen, zoomAt } from '../../geometry/viewport';
import { CATALOG } from '../../model/catalog';
import { Point } from '../../model/plan.model';
import { FurnitureSymbol } from '../../shared/furniture-symbol';
import { isTypingTarget } from '../../shared/dom';
import { EditorActions } from '../../state/editor-actions';
import { EditorStore, ToolId } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { decodeFurnitureDrag, FURNITURE_DRAG_MIME } from '../drag-drop';
import { createTools } from '../tools';
import { Hit, HitKind, Tool, ToolContext, ToolPointerEvent } from '../tools/tool';
import {
  accentViews,
  dimensionViews,
  furnitureViews,
  gridPaths,
  handleView,
  openingViews,
  overlayView,
  roomViews,
  wallViews,
} from './view-models';

/** Snap distance in screen pixels. */
const SNAP_PX = 10;

@Component({
  selector: 'app-plan-canvas',
  imports: [FurnitureSymbol],
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
  private readonly document = inject(DOCUMENT);
  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  /** Canvas size in px; 0 until the first layout. */
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

  private readonly tools: Record<ToolId, Tool> = createTools(this.ctx);

  protected readonly activeTool = computed(() => this.tools[this.editor.tool()]);
  readonly hint = computed(() => this.activeTool().hint);

  protected readonly cursor = computed(() => {
    if (this.panning()) return 'grabbing';
    if (this.spaceDown()) return 'grab';
    return this.activeTool().cursor;
  });

  // View models (built by the pure functions in ./view-models).

  protected readonly zoom = computed(() => this.editor.viewport().zoom);
  /** One screen pixel in world units. */
  protected readonly px = computed(() => 1 / this.zoom());
  protected readonly transform = computed(() => {
    const v = this.editor.viewport();
    return `translate(${v.x} ${v.y}) scale(${v.zoom})`;
  });
  protected readonly units = this.planStore.units;
  private readonly overlaps = computed(() => {
    const rooms = this.planStore.rooms();
    return findOverlaps(this.planStore.plan().furniture, this.planStore.segments(), (f) => itemElevation(f, rooms));
  });

  protected readonly grid = computed(() => gridPaths(this.editor.viewport(), this.size(), this.units()));
  /**
   * Fill for a floor pattern. The URL includes the page path because `<base href>` would otherwise
   * resolve `url(#id)` against the site root instead of this page.
   */
  protected patternFill(pattern: string): string {
    const { pathname, search } = this.document.location;
    return `url(${pathname}${search}#floor-${pattern})`;
  }

  protected readonly rooms = computed(() => roomViews(this.planStore.rooms(), this.editor.selectedIds(), this.units()));
  protected readonly walls = computed(() => wallViews(this.planStore.segments(), this.editor.selectedIds(), this.editor.hover()));
  protected readonly accents = computed(() => accentViews(this.planStore.segments(), this.px()));
  protected readonly openings = computed(() =>
    openingViews(this.planStore.plan().openings, this.planStore.segmentById(), this.editor.selectedIds(), this.px()),
  );
  protected readonly furniture = computed(() =>
    furnitureViews(this.planStore.plan().furniture, this.overlaps(), this.editor.selectedIds(), this.zoom(), (f) =>
      itemElevation(f, this.planStore.rooms()),
    ),
  );
  protected readonly dimensions = computed(() => dimensionViews(this.planStore.segments(), this.planStore.rooms(), this.units(), this.zoom()));
  protected readonly overlay = computed(() =>
    overlayView(this.editor.overlay(), this.planStore.segmentById(), this.units(), this.px(), this.editor.tool()),
  );

  /** Corner handles, shown only while selecting. */
  protected readonly nodes = computed(() => {
    if (this.editor.tool() !== 'select') return [];
    const sel = this.editor.selectedIds();
    return this.planStore.plan().nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, selected: sel.has(`node:${n.id}`) }));
  });

  protected readonly handles = computed(() => {
    const single = this.editor.singleSelection();
    if (single?.kind !== 'furniture' || this.editor.tool() !== 'select') return null;
    const f = this.planStore.plan().furniture.find((x) => x.id === single.id);
    return f ? handleView(f, this.units(), this.px()) : null;
  });

  /** Typed wall length bubble, positioned in screen space next to the cursor. */
  protected readonly typedBubble = computed(() => {
    const o = this.editor.overlay();
    if (!o.typedLength || !o.wallCursor) return null;
    const p = worldToScreen(this.editor.viewport(), o.wallCursor);
    return { text: o.typedLength, x: p.x + 16, y: p.y + 16 };
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
        this.editor.canvasSize.set({ width, height });
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
    return screenToWorld(this.editor.viewport(), p);
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
    this.editor.viewport.update((v) => zoomAt(v, anchor, factor));
  }

  fitToContent(): void {
    const size = this.size();
    if (!size.width || !size.height) return;
    const plan = this.planStore.plan();
    const points = [...plan.nodes, ...plan.furniture.flatMap((f) => rectCorners(f, f.width, f.depth, f.rotation))];
    this.editor.viewport.set(fitViewport(points, size));
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
    const value = e.dataTransfer?.getData(FURNITURE_DRAG_MIME);
    if (!value) return;
    const { catalogId, modelId } = decodeFurnitureDrag(value);
    if (!CATALOG.some((c) => c.id === catalogId)) return;
    e.preventDefault();
    this.actions.placeFurniture(catalogId, this.toToolEvent(e, false).world, modelId);
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
