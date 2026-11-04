import { newId, Opening, Plan, Point, Wall, WallNode, WallSide } from '../model/plan.model';
import { add, cross, dist, dot, EPS, len, normalize, perp, projectToSegment, scale, sub } from './vec';

/** Minimum wall length in cm; shorter segments are discarded. */
export const MIN_WALL_LENGTH = 5;
/** Distance within which points merge into an existing node. */
export const NODE_MERGE_TOLERANCE = 1;

export interface WallSegment {
  wall: Wall;
  a: Point;
  b: Point;
  length: number;
  /** Unit direction a -> b. */
  dir: Point;
  /** Unit normal, `perp(dir)`. */
  normal: Point;
}

export function nodeMap(plan: Pick<Plan, 'nodes'>): Map<string, WallNode> {
  return new Map(plan.nodes.map((n) => [n.id, n]));
}

export function wallSegment(wall: Wall, nodes: Map<string, WallNode>): WallSegment | null {
  const a = nodes.get(wall.a);
  const b = nodes.get(wall.b);
  if (!a || !b) return null;
  const d = sub(b, a);
  const dir = normalize(d);
  return { wall, a, b, length: len(d), dir, normal: perp(dir) };
}

export function wallSegments(plan: Pick<Plan, 'nodes' | 'walls'>): WallSegment[] {
  const nodes = nodeMap(plan);
  return plan.walls.map((w) => wallSegment(w, nodes)).filter((s): s is WallSegment => !!s);
}

/** Rectangle outline of a wall (centerline +- thickness/2), with square end caps. */
export function wallOutline(seg: WallSegment, capEnds = true): Point[] {
  const h = seg.wall.thickness / 2;
  const ext = capEnds ? scale(seg.dir, h) : { x: 0, y: 0 };
  const a = sub(seg.a, ext);
  const b = add(seg.b, ext);
  const n = scale(seg.normal, h);
  return [add(a, n), add(b, n), sub(b, n), sub(a, n)];
}

/** Keeps an opening fully on its wall. */
export function clampOpeningOffset(offset: number, width: number, wallLength: number): number {
  const half = width / 2;
  if (wallLength <= width) return wallLength / 2;
  return Math.min(wallLength - half, Math.max(half, offset));
}

// ---------------------------------------------------------------------------
// Draft mutations. These mutate the plan object passed in (a store draft).
// ---------------------------------------------------------------------------

export function findNodeNear(plan: Plan, p: Point, tolerance: number, exclude: string[] = []): WallNode | null {
  let best: WallNode | null = null;
  let bestD = tolerance;
  for (const n of plan.nodes) {
    if (exclude.includes(n.id)) continue;
    const d = dist(n, p);
    if (d <= bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** Splits a wall at point p (projected onto it). Returns the new middle node id. */
export function splitWall(plan: Plan, wallId: string, p: Point): string {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall) throw new Error(`No wall ${wallId}`);
  const nodes = nodeMap(plan);
  const seg = wallSegment(wall, nodes)!;
  const { point, t } = projectToSegment(p, seg.a, seg.b);
  if (t * seg.length < NODE_MERGE_TOLERANCE) return wall.a;
  if ((1 - t) * seg.length < NODE_MERGE_TOLERANCE) return wall.b;

  const node: WallNode = { id: newId('n'), x: point.x, y: point.y };
  plan.nodes.push(node);
  const second: Wall = { ...wall, id: newId('w'), a: node.id, ...(wall.colors ? { colors: { ...wall.colors } } : {}) };
  const oldB = wall.b;
  wall.b = node.id;
  second.b = oldB;
  plan.walls.push(second);

  const splitAt = t * seg.length;
  for (const o of plan.openings) {
    if (o.wallId !== wall.id) continue;
    if (o.offset > splitAt) {
      o.wallId = second.id;
      o.offset -= splitAt;
      o.offset = clampOpeningOffset(o.offset, o.width, seg.length - splitAt);
    } else {
      o.offset = clampOpeningOffset(o.offset, o.width, splitAt);
    }
  }
  return node.id;
}

/**
 * Returns a node at p: an existing node within tolerance, a new node splitting a wall
 * that passes within tolerance, or a fresh free node.
 */
export function nodeAt(plan: Plan, p: Point, tolerance = NODE_MERGE_TOLERANCE): string {
  const existing = findNodeNear(plan, p, tolerance);
  if (existing) return existing.id;
  const nodes = nodeMap(plan);
  for (const w of plan.walls) {
    const seg = wallSegment(w, nodes);
    if (!seg) continue;
    const proj = projectToSegment(p, seg.a, seg.b);
    if (proj.distance <= tolerance && proj.t > 0 && proj.t < 1) return splitWall(plan, w.id, proj.point);
  }
  const node: WallNode = { id: newId('n'), x: p.x, y: p.y };
  plan.nodes.push(node);
  return node.id;
}

function segmentIntersection(p1: Point, p2: Point, q1: Point, q2: Point): { t: number; u: number; point: Point } | null {
  const r = sub(p2, p1);
  const s = sub(q2, q1);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const qp = sub(q1, p1);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { t, u, point: add(p1, scale(r, t)) };
}

/**
 * Adds a straight wall from p1 to p2, merging with existing nodes, splitting walls it
 * touches or crosses, and skipping pieces that duplicate an existing wall.
 * Returns the ids of the created walls and the end node id.
 */
export function addWall(
  plan: Plan,
  p1: Point,
  p2: Point,
  props: { thickness: number; height: number },
): { wallIds: string[]; startNodeId: string; endNodeId: string } {
  const startNodeId = nodeAt(plan, p1);
  const endNodeId = nodeAt(plan, p2);
  const nodes = nodeMap(plan);
  const a = nodes.get(startNodeId)!;
  const b = nodes.get(endNodeId)!;
  if (startNodeId === endNodeId || dist(a, b) < MIN_WALL_LENGTH) {
    cleanupOrphanNodes(plan);
    return { wallIds: [], startNodeId, endNodeId };
  }

  // Collect points along the new segment where it must be split:
  // crossings with other walls, and existing nodes lying on it.
  const cuts: { t: number; nodeId: string }[] = [];
  const total = dist(a, b);
  for (const w of [...plan.walls]) {
    if (w.a === startNodeId || w.b === startNodeId || w.a === endNodeId || w.b === endNodeId) continue;
    const seg = wallSegment(w, nodeMap(plan));
    if (!seg) continue;
    const hit = segmentIntersection(a, b, seg.a, seg.b);
    if (!hit) continue;
    const alongNew = hit.t * total;
    if (alongNew < NODE_MERGE_TOLERANCE || total - alongNew < NODE_MERGE_TOLERANCE) continue;
    const nodeId = splitWall(plan, w.id, hit.point);
    cuts.push({ t: hit.t, nodeId });
  }
  for (const n of plan.nodes) {
    if (n.id === startNodeId || n.id === endNodeId || cuts.some((c) => c.nodeId === n.id)) continue;
    const proj = projectToSegment(n, a, b);
    if (proj.distance <= NODE_MERGE_TOLERANCE && proj.t > 0 && proj.t < 1) cuts.push({ t: proj.t, nodeId: n.id });
  }
  cuts.sort((x, y) => x.t - y.t);

  const chain = [startNodeId, ...cuts.map((c) => c.nodeId), endNodeId];
  const wallIds: string[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const u = chain[i];
    const v = chain[i + 1];
    if (u === v) continue;
    if (plan.walls.some((w) => (w.a === u && w.b === v) || (w.a === v && w.b === u))) continue;
    const wall: Wall = { id: newId('w'), a: u, b: v, thickness: props.thickness, height: props.height };
    plan.walls.push(wall);
    wallIds.push(wall.id);
  }
  return { wallIds, startNodeId, endNodeId };
}

export function removeWalls(plan: Plan, wallIds: string[]): void {
  const ids = new Set(wallIds);
  plan.walls = plan.walls.filter((w) => !ids.has(w.id));
  plan.openings = plan.openings.filter((o) => !ids.has(o.wallId));
  cleanupOrphanNodes(plan);
}

export function removeNodes(plan: Plan, nodeIds: string[]): void {
  const ids = new Set(nodeIds);
  removeWalls(
    plan,
    plan.walls.filter((w) => ids.has(w.a) || ids.has(w.b)).map((w) => w.id),
  );
  plan.nodes = plan.nodes.filter((n) => !ids.has(n.id));
}

export function cleanupOrphanNodes(plan: Plan): void {
  const used = new Set(plan.walls.flatMap((w) => [w.a, w.b]));
  plan.nodes = plan.nodes.filter((n) => used.has(n.id));
}

/** Merges node `fromId` into `toId`, rewiring walls and dropping degenerate or duplicate walls. */
export function mergeNodes(plan: Plan, fromId: string, toId: string): void {
  if (fromId === toId) return;
  for (const w of plan.walls) {
    if (w.a === fromId) w.a = toId;
    if (w.b === fromId) w.b = toId;
  }
  const seen = new Set<string>();
  const removed: string[] = [];
  for (const w of plan.walls) {
    const key = w.a < w.b ? `${w.a}|${w.b}` : `${w.b}|${w.a}`;
    if (w.a === w.b || seen.has(key)) removed.push(w.id);
    seen.add(key);
  }
  plan.nodes = plan.nodes.filter((n) => n.id !== fromId);
  if (removed.length) removeWalls(plan, removed);
}

/** Moves a wall's `b` node so the wall has the given length, keeping its direction. */
export function setWallLength(plan: Plan, wallId: string, length: number): void {
  const wall = plan.walls.find((w) => w.id === wallId);
  if (!wall || length < MIN_WALL_LENGTH) return;
  const nodes = nodeMap(plan);
  const seg = wallSegment(wall, nodes);
  if (!seg) return;
  const nb = nodes.get(wall.b)!;
  const target = add(seg.a, scale(seg.dir, length));
  nb.x = target.x;
  nb.y = target.y;
  reclampOpenings(plan);
}

/** Re-clamps every opening after walls change length. */
export function reclampOpenings(plan: Plan): void {
  const nodes = nodeMap(plan);
  const walls = new Map(plan.walls.map((w) => [w.id, w]));
  plan.openings = plan.openings.filter((o) => walls.has(o.wallId));
  for (const o of plan.openings) {
    const seg = wallSegment(walls.get(o.wallId)!, nodes);
    if (seg) o.offset = clampOpeningOffset(o.offset, o.width, seg.length);
  }
}

/** Position, direction and normal of an opening's center on its wall. */
export function openingFrame(o: Opening, seg: WallSegment): { center: Point; dir: Point; normal: Point } {
  return { center: add(seg.a, scale(seg.dir, o.offset)), dir: seg.dir, normal: seg.normal };
}

/** Nearest wall to a point, within a tolerance. */
export function nearestWall(
  segs: WallSegment[],
  p: Point,
  tolerance: number,
): { seg: WallSegment; t: number; point: Point; distance: number; offset: number } | null {
  let best: { seg: WallSegment; t: number; point: Point; distance: number; offset: number } | null = null;
  for (const seg of segs) {
    const proj = projectToSegment(p, seg.a, seg.b);
    const limit = tolerance + seg.wall.thickness / 2;
    if (proj.distance <= limit && (!best || proj.distance < best.distance)) {
      best = { seg, ...proj, offset: proj.t * seg.length };
    }
  }
  return best;
}

/** Signed distance of p from the wall's centerline along its normal. */
export function sideOfWall(seg: WallSegment, p: Point): number {
  return dot(sub(p, seg.a), seg.normal);
}

/** How far inside the face a trim strip is tested against neighboring walls, so collinear walls count too. */
const TRIM_PROBE = 0.1;

/**
 * Ranges along a wall face (x in cm from the wall's midpoint, along `dir`) that other walls cover,
 * so trim on this face stops where it runs into a joining wall instead of overlapping it.
 */
export function faceTrimGaps(seg: WallSegment, side: WallSide, segments: WallSegment[]): Array<[number, number]> {
  const mid = add(seg.a, scale(seg.dir, seg.length / 2));
  const v0 = (side === 'front' ? 1 : -1) * (seg.wall.thickness / 2 - TRIM_PROBE);
  const gaps: Array<[number, number]> = [];
  for (const other of segments) {
    if (other.wall.id === seg.wall.id) continue;
    const poly = wallOutline(other, false).map((p) => {
      const d = sub(p, mid);
      return { u: dot(d, seg.dir), v: dot(d, seg.normal) };
    });
    const us: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      if ((p.v - v0) * (q.v - v0) > 0 || p.v === q.v) continue;
      us.push(p.u + ((v0 - p.v) / (q.v - p.v)) * (q.u - p.u));
    }
    if (us.length >= 2) gaps.push([Math.min(...us), Math.max(...us)]);
  }
  return gaps;
}

/** `[x0, x1]` minus the gaps, as the pieces that remain. */
export function subtractGaps(x0: number, x1: number, gaps: Array<[number, number]>): Array<[number, number]> {
  let parts: Array<[number, number]> = [[x0, x1]];
  for (const [g0, g1] of gaps) {
    parts = parts.flatMap(([a, b]): Array<[number, number]> => {
      if (g1 <= a || g0 >= b) return [[a, b]];
      const out: Array<[number, number]> = [];
      if (g0 > a) out.push([a, g0]);
      if (g1 < b) out.push([g1, b]);
      return out;
    });
  }
  return parts;
}
