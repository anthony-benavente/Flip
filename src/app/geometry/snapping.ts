import { Plan, Point } from '../model/plan.model';
import { add, angleDeg, dist, len, projectToSegment, rotate, scale, sub } from './vec';
import { wallSegments } from './wall-geometry';

export type SnapKind = 'node' | 'wall' | 'angle' | 'align' | 'grid' | 'none';

export interface SnapGuide {
  from: Point;
  to: Point;
}

export interface SnapResult {
  point: Point;
  kind: SnapKind;
  nodeId?: string;
  wallId?: string;
  guides: SnapGuide[];
}

export interface SnapOptions {
  /** Snap tolerance in world units (screen pixels / zoom). */
  tolerance: number;
  grid: number;
  /** Previous point of the wall being drawn, enables angle locking. */
  from?: Point | null;
  /** Forces 0/90 degree angles relative to `from`. */
  orthogonal?: boolean;
  /** Nodes to ignore (e.g. the node being dragged). */
  excludeNodeIds?: string[];
  /** Walls to ignore (e.g. walls attached to the dragged node). */
  excludeWallIds?: string[];
  /** Disables all snapping (Alt held). */
  disabled?: boolean;
}

const ANGLE_STEP = 15;
const ANGLE_CAPTURE = 4;

export function snapToGrid(p: Point, grid: number): Point {
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
}

/**
 * Snaps a point for wall drawing and node dragging. Priority:
 * existing node > point on wall > angle lock (from previous point) > alignment with nodes > grid.
 */
export function snapPoint(raw: Point, plan: Pick<Plan, 'nodes' | 'walls'>, opts: SnapOptions): SnapResult {
  if (opts.disabled) return { point: raw, kind: 'none', guides: [] };
  const exclude = new Set(opts.excludeNodeIds ?? []);
  const excludeWalls = new Set(opts.excludeWallIds ?? []);

  // 1. Existing nodes.
  let bestNode: { id: string; p: Point; d: number } | null = null;
  for (const n of plan.nodes) {
    if (exclude.has(n.id)) continue;
    const d = dist(n, raw);
    if (d <= opts.tolerance && (!bestNode || d < bestNode.d)) bestNode = { id: n.id, p: { x: n.x, y: n.y }, d };
  }
  if (bestNode) return { point: bestNode.p, kind: 'node', nodeId: bestNode.id, guides: [] };

  // 2. Angle lock relative to the previous point.
  let candidate: Point | null = null;
  let kind: SnapKind = 'grid';
  const guides: SnapGuide[] = [];
  if (opts.from) {
    const v = sub(raw, opts.from);
    const length = len(v);
    if (length > 0) {
      const angle = angleDeg(v);
      const step = opts.orthogonal ? 90 : ANGLE_STEP;
      const snapped = Math.round(angle / step) * step;
      if (opts.orthogonal || Math.abs(angle - snapped) <= ANGLE_CAPTURE) {
        const dir = rotate({ x: 1, y: 0 }, snapped);
        // Length along the locked direction, not the raw cursor distance.
        const along = v.x * dir.x + v.y * dir.y;
        const l = Math.max(opts.grid, Math.round(along / opts.grid) * opts.grid);
        candidate = add(opts.from, scale(dir, l));
        // Prefer the exact length that lines up with another node along this ray.
        const aligned = alignAlongRay(opts.from, dir, raw, plan, exclude, opts.tolerance);
        if (aligned) {
          candidate = aligned.point;
          guides.push(aligned.guide);
        }
        kind = 'angle';
      }
    }
  }

  // 3. Points on walls (projected), checked against the candidate if angle-locked.
  const probe = candidate ?? raw;
  for (const seg of wallSegments(plan)) {
    if (excludeWalls.has(seg.wall.id) || exclude.has(seg.wall.a) || exclude.has(seg.wall.b)) continue;
    const proj = projectToSegment(probe, seg.a, seg.b);
    if (proj.distance <= opts.tolerance) {
      return { point: proj.point, kind: 'wall', wallId: seg.wall.id, guides };
    }
  }
  if (candidate) return { point: candidate, kind, guides };

  // 4. Axis alignment with existing nodes.
  let x = Math.round(raw.x / opts.grid) * opts.grid;
  let y = Math.round(raw.y / opts.grid) * opts.grid;
  let alignedX: Point | null = null;
  let alignedY: Point | null = null;
  for (const n of plan.nodes) {
    if (exclude.has(n.id)) continue;
    if (Math.abs(n.x - raw.x) <= opts.tolerance && (!alignedX || Math.abs(n.x - raw.x) < Math.abs(alignedX.x - raw.x))) alignedX = n;
    if (Math.abs(n.y - raw.y) <= opts.tolerance && (!alignedY || Math.abs(n.y - raw.y) < Math.abs(alignedY.y - raw.y))) alignedY = n;
  }
  if (alignedX) x = alignedX.x;
  if (alignedY) y = alignedY.y;
  const point = { x, y };
  if (alignedX) guides.push({ from: { x: alignedX.x, y: alignedX.y }, to: point });
  if (alignedY) guides.push({ from: { x: alignedY.x, y: alignedY.y }, to: point });
  return { point, kind: alignedX || alignedY ? 'align' : 'grid', guides };
}

function alignAlongRay(
  origin: Point,
  dir: Point,
  raw: Point,
  plan: Pick<Plan, 'nodes'>,
  exclude: Set<string>,
  tolerance: number,
): { point: Point; guide: SnapGuide } | null {
  const along = (raw.x - origin.x) * dir.x + (raw.y - origin.y) * dir.y;
  const onRay = add(origin, scale(dir, along));
  let best: { point: Point; guide: SnapGuide; d: number } | null = null;
  for (const n of plan.nodes) {
    if (exclude.has(n.id)) continue;
    // Horizontal ray: align x with node; vertical ray: align y.
    if (Math.abs(dir.y) < 1e-9 && Math.abs(n.x - onRay.x) <= tolerance) {
      const p = { x: n.x, y: onRay.y };
      const d = Math.abs(n.x - onRay.x);
      if (!best || d < best.d) best = { point: p, guide: { from: { x: n.x, y: n.y }, to: p }, d };
    }
    if (Math.abs(dir.x) < 1e-9 && Math.abs(n.y - onRay.y) <= tolerance) {
      const p = { x: onRay.x, y: n.y };
      const d = Math.abs(n.y - onRay.y);
      if (!best || d < best.d) best = { point: p, guide: { from: { x: n.x, y: n.y }, to: p }, d };
    }
  }
  return best ? { point: best.point, guide: best.guide } : null;
}
