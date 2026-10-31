import { measureToWalls, snapFurnitureToWall } from '../../geometry/furniture-geometry';
import { snapPoint, SnapResult } from '../../geometry/snapping';
import { add, angleDeg, dot, projectToSegment, rotate, scale, sub } from '../../geometry/vec';
import { clampOpeningOffset, mergeNodes, reclampOpenings, splitWall, wallSegment } from '../../geometry/wall-geometry';
import { catalogItem } from '../../model/catalog';
import { FurnitureItem, Point } from '../../model/plan.model';
import { SelectionItem } from '../../state/editor.store';
import { Tool, ToolContext, ToolPointerEvent } from './tool';

const DRAG_THRESHOLD_PX = 3;
const DRAG_KEY = 'select-drag';
const MIN_FURNITURE_SIZE = 5;

type Mode =
  | { kind: 'idle' }
  | { kind: 'box'; start: Point; additive: boolean; roomKey: string | null }
  | { kind: 'node'; id: string; start: Point; origin: Point; lastSnap: SnapResult | null }
  | { kind: 'wall'; id: string; start: Point; a: Point; b: Point; normal: Point }
  | { kind: 'opening'; id: string; start: Point }
  | { kind: 'furniture'; start: Point; origins: Map<string, { x: number; y: number; rotation: number }> }
  | { kind: 'rotate'; id: string; center: Point }
  | { kind: 'resize'; id: string; handle: string; origin: FurnitureItem };

/** Selects and directly manipulates corners, walls, openings, furniture and rooms. */
export class SelectTool implements Tool {
  readonly id = 'select' as const;
  readonly cursor = 'default';
  readonly hint = 'Click to select · drag to move · Shift-click to add · drag empty space to box-select · Alt disables snapping';

  private mode: Mode = { kind: 'idle' };
  private downScreen: Point | null = null;
  private moved = false;

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;
    const { editor, plan } = this.ctx;
    const hit = e.hit;
    this.downScreen = e.screen;
    this.moved = false;

    if (hit?.kind === 'handle') {
      const f = plan.plan().furniture.find((x) => x.id === hit.id);
      if (!f) return;
      this.mode =
        hit.handle === 'rotate'
          ? { kind: 'rotate', id: f.id, center: { x: f.x, y: f.y } }
          : { kind: 'resize', id: f.id, handle: hit.handle ?? 'e', origin: { ...f } };
      return;
    }

    if (hit && hit.kind !== 'room') {
      const item: SelectionItem = { kind: hit.kind, id: hit.id };
      const selected = editor.isSelected(hit.kind, hit.id);
      if (e.shift) {
        editor.toggle(item);
        if (selected) {
          this.mode = { kind: 'idle' };
          return;
        }
      } else if (!selected) {
        editor.select([item]);
      }
    }

    switch (hit?.kind) {
      case 'node': {
        const n = plan.nodes().get(hit.id);
        if (n) this.mode = { kind: 'node', id: n.id, start: e.world, origin: { x: n.x, y: n.y }, lastSnap: null };
        return;
      }
      case 'wall': {
        const seg = plan.segmentById().get(hit.id);
        if (seg) this.mode = { kind: 'wall', id: hit.id, start: e.world, a: seg.a, b: seg.b, normal: seg.normal };
        return;
      }
      case 'opening':
        this.mode = { kind: 'opening', id: hit.id, start: e.world };
        return;
      case 'furniture': {
        const ids = new Set(editor.selection().filter((s) => s.kind === 'furniture').map((s) => s.id));
        const origins = new Map(
          plan
            .plan()
            .furniture.filter((f) => ids.has(f.id))
            .map((f) => [f.id, { x: f.x, y: f.y, rotation: f.rotation }]),
        );
        this.mode = { kind: 'furniture', start: e.world, origins };
        return;
      }
      default:
        this.mode = { kind: 'box', start: e.world, additive: e.shift, roomKey: hit?.kind === 'room' ? hit.id : null };
    }
  }

  onPointerMove(e: ToolPointerEvent): void {
    const { editor } = this.ctx;
    if (this.mode.kind === 'idle') {
      editor.hover.set(e.hit && e.hit.kind !== 'handle' ? { kind: e.hit.kind, id: e.hit.id } : null);
      return;
    }
    if (!this.moved) {
      if (!this.downScreen) return;
      const dx = e.screen.x - this.downScreen.x;
      const dy = e.screen.y - this.downScreen.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      this.moved = true;
    }

    switch (this.mode.kind) {
      case 'box':
        editor.setOverlay({ box: { a: this.mode.start, b: e.world } });
        break;
      case 'node':
        this.dragNode(this.mode, e);
        break;
      case 'wall':
        this.dragWall(this.mode, e);
        break;
      case 'opening':
        this.dragOpening(this.mode.id, e);
        break;
      case 'furniture':
        this.dragFurniture(this.mode, e);
        break;
      case 'rotate':
        this.rotateFurniture(this.mode, e);
        break;
      case 'resize':
        this.resizeFurniture(this.mode, e);
        break;
    }
  }

  onPointerUp(e: ToolPointerEvent): void {
    const { editor, plan } = this.ctx;
    const mode = this.mode;
    this.mode = { kind: 'idle' };

    if (mode.kind === 'box') {
      if (this.moved) {
        this.boxSelect(mode.start, e.world, mode.additive);
      } else if (mode.roomKey) {
        const item: SelectionItem = { kind: 'room', id: mode.roomKey };
        if (mode.additive) editor.toggle(item);
        else editor.select([item]);
      } else if (!mode.additive) {
        editor.clearSelection();
      }
    }

    if (mode.kind === 'node' && this.moved && mode.lastSnap) {
      const snap = mode.lastSnap;
      plan.update(
        (draft) => {
          if (snap.kind === 'node' && snap.nodeId) {
            mergeNodes(draft, mode.id, snap.nodeId);
          } else if (snap.kind === 'wall' && snap.wallId && draft.walls.some((w) => w.id === snap.wallId)) {
            const mid = splitWall(draft, snap.wallId, snap.point);
            mergeNodes(draft, mid, mode.id);
          }
          reclampOpenings(draft);
        },
        { coalesceKey: DRAG_KEY },
      );
      if (snap.kind === 'node' && snap.nodeId) editor.select([{ kind: 'node', id: snap.nodeId }]);
    }

    plan.commit();
    editor.setOverlay({ box: null, snapPoint: null, guides: [], measures: [] });
    this.downScreen = null;
    this.moved = false;
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.mode.kind !== 'idle') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    if (this.mode.kind !== 'idle' && this.moved) {
      this.ctx.plan.commit();
      this.ctx.plan.undo();
    }
    this.mode = { kind: 'idle' };
    this.moved = false;
    this.ctx.editor.setOverlay({ box: null, snapPoint: null, guides: [], measures: [] });
  }

  // -------------------------------------------------------------------------

  private dragNode(mode: Extract<Mode, { kind: 'node' }>, e: ToolPointerEvent): void {
    const plan = this.ctx.plan.plan();
    const attached = plan.walls.filter((w) => w.a === mode.id || w.b === mode.id).map((w) => w.id);
    const raw = add(mode.origin, sub(e.world, mode.start));
    const snap = snapPoint(raw, plan, {
      tolerance: this.ctx.tolerance(),
      grid: this.ctx.grid(),
      excludeNodeIds: [mode.id],
      excludeWallIds: attached,
      disabled: e.alt,
    });
    mode.lastSnap = snap;
    this.ctx.plan.update(
      (draft) => {
        const n = draft.nodes.find((x) => x.id === mode.id);
        if (n) {
          n.x = snap.point.x;
          n.y = snap.point.y;
        }
        reclampOpenings(draft);
      },
      { coalesceKey: DRAG_KEY },
    );
    this.ctx.editor.setOverlay({
      snapPoint: snap.kind === 'node' || snap.kind === 'wall' ? snap.point : null,
      snapKind: snap.kind,
      guides: snap.guides,
    });
  }

  private dragWall(mode: Extract<Mode, { kind: 'wall' }>, e: ToolPointerEvent): void {
    let d = dot(sub(e.world, mode.start), mode.normal);
    if (!e.alt) d = Math.round(d / this.ctx.grid()) * this.ctx.grid();
    const shift = scale(mode.normal, d);
    this.ctx.plan.update(
      (draft) => {
        const wall = draft.walls.find((w) => w.id === mode.id);
        if (!wall) return;
        for (const [nodeId, origin] of [
          [wall.a, mode.a],
          [wall.b, mode.b],
        ] as const) {
          const n = draft.nodes.find((x) => x.id === nodeId);
          if (n) {
            n.x = origin.x + shift.x;
            n.y = origin.y + shift.y;
          }
        }
        reclampOpenings(draft);
      },
      { coalesceKey: DRAG_KEY },
    );
  }

  private dragOpening(id: string, e: ToolPointerEvent): void {
    const plan = this.ctx.plan;
    const o = plan.plan().openings.find((x) => x.id === id);
    const seg = o && plan.segmentById().get(o.wallId);
    if (!o || !seg) return;
    let offset = projectToSegment(e.world, seg.a, seg.b).t * seg.length;
    if (!e.alt) offset = Math.round(offset / this.ctx.grid()) * this.ctx.grid();
    offset = clampOpeningOffset(offset, o.width, seg.length);
    plan.update(
      (draft) => {
        const target = draft.openings.find((x) => x.id === id);
        if (target) target.offset = offset;
      },
      { coalesceKey: DRAG_KEY },
    );
  }

  private dragFurniture(mode: Extract<Mode, { kind: 'furniture' }>, e: ToolPointerEvent): void {
    const delta = sub(e.world, mode.start);
    const segs = this.ctx.plan.segments();
    const single = mode.origins.size === 1;
    let measures: { from: Point; to: Point }[] = [];
    this.ctx.plan.update(
      (draft) => {
        for (const f of draft.furniture) {
          const origin = mode.origins.get(f.id);
          if (!origin) continue;
          let x = origin.x + delta.x;
          let y = origin.y + delta.y;
          f.rotation = origin.rotation;
          if (single && !e.alt && !catalogItem(f.catalogId).noWallSnap) {
            const snapped = snapFurnitureToWall({ x, y }, f, segs, this.ctx.tolerance());
            if (snapped) {
              x = snapped.x;
              y = snapped.y;
              f.rotation = snapped.rotation;
            }
          }
          f.x = Math.round(x * 10) / 10;
          f.y = Math.round(y * 10) / 10;
          if (single) measures = measureToWalls(f, segs);
        }
      },
      { coalesceKey: DRAG_KEY },
    );
    this.ctx.editor.setOverlay({ measures });
  }

  private rotateFurniture(mode: Extract<Mode, { kind: 'rotate' }>, e: ToolPointerEvent): void {
    let angle = angleDeg(sub(e.world, mode.center)) + 90;
    if (!e.alt) angle = Math.round(angle / 15) * 15;
    angle = ((angle % 360) + 360) % 360;
    this.ctx.plan.update(
      (draft) => {
        const f = draft.furniture.find((x) => x.id === mode.id);
        if (f) f.rotation = angle > 180 ? angle - 360 : angle;
      },
      { coalesceKey: DRAG_KEY },
    );
  }

  private resizeFurniture(mode: Extract<Mode, { kind: 'resize' }>, e: ToolPointerEvent): void {
    const o = mode.origin;
    const local = rotate(sub(e.world, o), -o.rotation);
    const step = e.alt ? 0.1 : this.ctx.grid() / 6;
    const snapLen = (v: number) => Math.max(MIN_FURNITURE_SIZE, Math.round(v / step) * step);
    let width = o.width;
    let depth = o.depth;
    let shiftLocal: Point = { x: 0, y: 0 };
    switch (mode.handle) {
      case 'e':
        width = snapLen(local.x + o.width / 2);
        shiftLocal = { x: (width - o.width) / 2, y: 0 };
        break;
      case 'w':
        width = snapLen(o.width / 2 - local.x);
        shiftLocal = { x: -(width - o.width) / 2, y: 0 };
        break;
      case 's':
        depth = snapLen(local.y + o.depth / 2);
        shiftLocal = { x: 0, y: (depth - o.depth) / 2 };
        break;
      case 'n':
        depth = snapLen(o.depth / 2 - local.y);
        shiftLocal = { x: 0, y: -(depth - o.depth) / 2 };
        break;
    }
    const center = add(o, rotate(shiftLocal, o.rotation));
    this.ctx.plan.update(
      (draft) => {
        const f = draft.furniture.find((x) => x.id === mode.id);
        if (!f) return;
        f.width = width;
        f.depth = depth;
        f.x = center.x;
        f.y = center.y;
      },
      { coalesceKey: DRAG_KEY },
    );
  }

  private boxSelect(a: Point, b: Point, additive: boolean): void {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const inside = (p: Point) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    const plan = this.ctx.plan.plan();
    const nodes = this.ctx.plan.nodes();
    const items: SelectionItem[] = [];
    for (const f of plan.furniture) if (inside(f)) items.push({ kind: 'furniture', id: f.id });
    for (const w of plan.walls) {
      const seg = wallSegment(w, nodes);
      if (seg && inside(seg.a) && inside(seg.b)) items.push({ kind: 'wall', id: w.id });
    }
    const editor = this.ctx.editor;
    if (additive) {
      const existing = editor.selectedIds();
      editor.select([...editor.selection(), ...items.filter((i) => !existing.has(`${i.kind}:${i.id}`))]);
    } else {
      editor.select(items);
    }
  }
}
