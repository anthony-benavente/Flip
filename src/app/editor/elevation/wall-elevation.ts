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
import { FaceBox, snapOnFace } from '../../geometry/elevation-snap';
import { gridSize } from '../../geometry/units';
import { fitViewport, screenToWorld, Size, Viewport, zoomAt } from '../../geometry/viewport';
import { CATALOG, catalogItem, EYE_LEVEL, mountOf } from '../../model/catalog';
import { moveOnWall } from '../../model/plan-operations';
import { Point } from '../../model/plan.model';
import { ImageLibrary } from '../../persistence/image-library';
import { EditorActions } from '../../state/editor-actions';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { readHit } from '../canvas/hit';
import { decodeFurnitureDrag, FURNITURE_DRAG_MIME } from '../drag-drop';
import { elevationView, ElevationItem, faceFrame } from './elevation-view-models';

const DRAG_KEY = 'elevation-drag';
const NUDGE_KEY = 'elevation-nudge';
const DRAG_THRESHOLD_PX = 3;
/** Height of the ceiling strip drawn above the wall (cm). */
export const CEILING_BAND = 12;

interface Drag {
  id: string;
  start: Point;
  startScreen: Point;
  origin: FaceBox;
  moved: boolean;
}

/**
 * Face-on view of one side of a wall: its paint, trim, doors and windows, the furniture standing
 * in front of it, and the art, mirrors, shelves and lights hung on it, which can be dragged along
 * the wall and up and down.
 */
@Component({
  selector: 'app-wall-elevation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-elevation.html',
  styleUrl: './wall-elevation.css',
})
export class WallElevation {
  private readonly plan = inject(PlanStore);
  protected readonly editor = inject(EditorStore);
  private readonly actions = inject(EditorActions);
  private readonly images = inject(ImageLibrary);
  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  private readonly size = signal<Size>({ width: 0, height: 0 });
  protected readonly viewport = signal<Viewport>({ x: 0, y: 0, zoom: 1 });
  protected readonly snapGuides = signal<{ x?: number; height?: number }[]>([]);
  private drag: Drag | null = null;
  private panLast: Point | null = null;

  protected readonly target = this.editor.elevation;
  protected readonly segment = computed(() => {
    const t = this.target();
    return t ? this.plan.segmentById().get(t.wallId) : undefined;
  });
  protected readonly view = computed(() => {
    const t = this.target();
    const seg = this.segment();
    if (!t || !seg) return null;
    const plan = this.plan.plan();
    return elevationView({
      seg,
      side: t.side,
      segments: this.plan.segments(),
      furniture: plan.furniture,
      openings: plan.openings,
      rooms: this.plan.rooms(),
      selected: this.editor.selectedIds(),
      units: this.plan.units(),
      imageUrl: (id) => this.images.url(id),
    });
  });
  protected readonly transform = computed(() => {
    const v = this.viewport();
    return `translate(${v.x} ${v.y}) scale(${v.zoom})`;
  });
  /** One screen pixel in drawing units. */
  protected readonly px = computed(() => 1 / this.viewport().zoom);
  protected readonly ceilingBand = CEILING_BAND;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const ro = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        const first = !this.size().width;
        this.size.set({ width, height });
        if (first && width > 0) this.fit();
      });
      ro.observe(this.svgRef().nativeElement);
      destroyRef.onDestroy(() => ro.disconnect());
    });

    // A new wall face starts fitted; a face whose wall was deleted closes the view.
    effect(() => {
      const t = this.target();
      const seg = this.segment();
      untracked(() => {
        if (t && !seg) this.editor.closeElevation();
        else this.fit();
      });
    });
  }

  /** Frame width of framed art and mirrors, matching the 3D model (cm). */
  protected frame(i: ElevationItem): number {
    return Math.min(4, Math.min(i.w, i.h) * 0.06);
  }

  /** Inset of a framed print's picture: frame plus mat. */
  protected inset(i: ElevationItem): number {
    return this.frame(i) + Math.min(i.w, i.h) * 0.12;
  }

  fit(): void {
    const size = this.size();
    const v = untracked(this.view);
    if (!v || !size.width || !size.height) return;
    this.viewport.set(
      fitViewport(
        [
          { x: 0, y: 0 },
          { x: v.width, y: -v.height - CEILING_BAND },
        ],
        size,
        40,
      ),
    );
  }

  protected flipSide(): void {
    const t = this.target();
    if (t) this.editor.openElevation(t.wallId, t.side === 'front' ? 'back' : 'front');
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private toWorld(e: MouseEvent): { screen: Point; world: Point } {
    const rect = this.svgRef().nativeElement.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return { screen, world: screenToWorld(this.viewport(), screen) };
  }

  private item(id: string): ElevationItem | undefined {
    return this.view()?.items.find((i) => i.id === id);
  }

  protected onPointerDown(e: PointerEvent): void {
    const svg = this.svgRef().nativeElement;
    const { screen, world } = this.toWorld(e);
    const hit = readHit(e.target);
    const item = hit?.kind === 'furniture' && e.button === 0 ? this.item(hit.id) : undefined;
    svg.setPointerCapture?.(e.pointerId);
    if (item) {
      this.editor.select([{ kind: 'furniture', id: item.id }]);
      this.drag = {
        id: item.id,
        start: world,
        startScreen: screen,
        origin: { x: item.x, w: item.w, bottom: -item.y - item.h, h: item.h },
        moved: false,
      };
      return;
    }
    if (hit?.kind === 'furniture') {
      this.editor.select([{ kind: 'furniture', id: hit.id }]);
      return;
    }
    // Empty wall or background: pan, and deselect on a plain click.
    this.panLast = { x: e.clientX, y: e.clientY };
    if (e.button === 0) this.editor.clearSelection();
  }

  protected onPointerMove(e: PointerEvent): void {
    if (this.panLast) {
      const dx = e.clientX - this.panLast.x;
      const dy = e.clientY - this.panLast.y;
      this.panLast = { x: e.clientX, y: e.clientY };
      this.viewport.update((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
    const drag = this.drag;
    if (!drag) return;
    const { screen, world } = this.toWorld(e);
    if (
      !drag.moved &&
      Math.hypot(screen.x - drag.startScreen.x, screen.y - drag.startScreen.y) < DRAG_THRESHOLD_PX
    )
      return;
    drag.moved = true;
    const box: FaceBox = {
      ...drag.origin,
      x: drag.origin.x + world.x - drag.start.x,
      bottom: drag.origin.bottom - (world.y - drag.start.y),
    };
    let placed = { x: box.x, bottom: box.bottom };
    if (e.altKey) this.snapGuides.set([]);
    else {
      const snap = snapOnFace(box, this.snapTargets(drag.id));
      placed = snap;
      this.snapGuides.set(snap.guides);
    }
    this.moveItem(drag.id, placed.x + box.w / 2, placed.bottom, DRAG_KEY);
  }

  protected onPointerUp(e: PointerEvent): void {
    const svg = this.svgRef().nativeElement;
    if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    this.panLast = null;
    if (this.drag?.moved) this.plan.commit();
    this.drag = null;
    this.snapGuides.set([]);
  }

  protected onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { screen } = this.toWorld(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.viewport.update((v) => zoomAt(v, screen, Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015))));
  }

  /** Arrow keys move the selected item on this face. Called by the editor page before global shortcuts. */
  handleKey(e: KeyboardEvent): boolean {
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const dir = keys[e.key];
    const single = this.editor.singleSelection();
    const item = dir && single?.kind === 'furniture' ? this.item(single.id) : undefined;
    if (!item) return false;
    const grid = gridSize(this.plan.units());
    const step = e.shiftKey ? grid * 4 : grid / 6;
    this.moveItem(
      item.id,
      item.x + item.w / 2 + dir[0] * step,
      -item.y - item.h + dir[1] * step,
      NUDGE_KEY,
    );
    return true;
  }

  /** Moves a hung item so its center is at `x` on the face and its bottom at `bottom`. */
  private moveItem(id: string, x: number, bottom: number, coalesceKey: string): void {
    const t = this.target();
    const seg = this.segment();
    if (!t || !seg) return;
    const along = faceFrame(seg, t.side).toAlong(x);
    this.plan.update((d) => moveOnWall(d, id, seg, t.side, along, bottom), { coalesceKey });
  }

  private snapTargets(movingId: string) {
    const v = this.view()!;
    const others = v.items.filter((i) => i.id !== movingId);
    const tops = v.silhouettes.map((s) => -s.y);
    return {
      centerLevels: [EYE_LEVEL],
      levels: [...tops, ...others.flatMap((i) => [-i.y - i.h, -i.y])],
      centers: [
        ...v.silhouettes.map((s) => s.x + s.w / 2),
        ...others.map((i) => i.x + i.w / 2),
        v.width / 2,
      ],
      edges: others.flatMap((i) => [i.x, i.x + i.w]),
      grid: gridSize(this.plan.units()),
      tolerance: 8 * this.px(),
    };
  }

  protected onDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types.includes(FURNITURE_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  /** Wall items land where they are dropped; anything else stands on the floor in front of the wall. */
  protected onDrop(e: DragEvent): void {
    const value = e.dataTransfer?.getData(FURNITURE_DRAG_MIME);
    const t = this.target();
    const seg = this.segment();
    if (!value || !t || !seg) return;
    const { catalogId, modelId } = decodeFurnitureDrag(value);
    if (!CATALOG.some((c) => c.id === catalogId)) return;
    e.preventDefault();
    const { world } = this.toWorld(e);
    const frame = faceFrame(seg, t.side);
    const along = Math.min(Math.max(frame.toAlong(world.x), 0), frame.length);
    const c = catalogItem(catalogId);
    if (mountOf(c) === 'wall') {
      this.actions.hangOnWall(
        catalogId,
        seg,
        t.side,
        along,
        Math.max(0, -world.y - c.height / 2),
        modelId,
      );
    } else {
      const out = seg.wall.thickness / 2 + c.depth / 2 + 1;
      const at = {
        x: seg.a.x + seg.dir.x * along + frame.outward.x * out,
        y: seg.a.y + seg.dir.y * along + frame.outward.y * out,
      };
      this.actions.placeFurniture(catalogId, at, modelId);
    }
  }
}
