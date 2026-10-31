import { catalogItem } from '../model/catalog';
import { FurnitureItem, Point } from '../model/plan.model';
import { add, angleDeg, convexOverlap, cross, dot, rectCorners, rotate, scale, sub } from './vec';
import { WallSegment, wallOutline } from './wall-geometry';

export interface Placement {
  x: number;
  y: number;
  rotation: number;
}

function normalizeAngle(a: number): number {
  a = ((a % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

/**
 * If an item centered at `center` is close to a wall, returns a placement that puts one of its
 * edges flush against the wall face. With `backToWall`, the item's back edge (local -y) faces
 * the wall; otherwise the orientation closest to the current rotation is kept.
 */
export function snapFurnitureToWall(
  center: Point,
  item: Pick<FurnitureItem, 'width' | 'depth' | 'rotation'>,
  segs: WallSegment[],
  tolerance: number,
  backToWall = false,
): Placement | null {
  let best: (Placement & { score: number; seg: WallSegment; extentAlong: number }) | null = null;
  for (const seg of segs) {
    const rel = sub(center, seg.a);
    const along = dot(rel, seg.dir);
    if (along < 0 || along > seg.length) continue;
    const side = dot(rel, seg.normal);
    const n = side >= 0 ? seg.normal : scale(seg.normal, -1);
    const faceDist = Math.abs(side) - seg.wall.thickness / 2;

    // Rotation that makes the item's local +y (front) point away from the wall.
    const base = angleDeg(n) - 90;
    let rotation = base;
    if (!backToWall) {
      let bestDiff = Infinity;
      for (let k = 0; k < 4; k++) {
        const r = base + k * 90;
        const diff = Math.abs(normalizeAngle(r - item.rotation));
        if (diff < bestDiff) {
          bestDiff = diff;
          rotation = r;
        }
      }
    }
    const quarter = Math.round(normalizeAngle(rotation - base) / 90);
    const extent = quarter % 2 === 0 ? item.depth / 2 : item.width / 2;
    const gap = faceDist - extent;
    if (faceDist < -seg.wall.thickness) continue;
    // Dropping: the cursor must be near the wall. Dragging: the item's edge must be near it.
    const score = backToWall ? faceDist : Math.abs(gap);
    if ((backToWall ? faceDist : gap) > tolerance) continue;
    if (!best || score < best.score) {
      const p = add(add(seg.a, scale(seg.dir, along)), scale(n, seg.wall.thickness / 2 + extent));
      const extentAlong = quarter % 2 === 0 ? item.width / 2 : item.depth / 2;
      best = { x: p.x, y: p.y, rotation: normalizeAngle(rotation), score, seg, extentAlong };
    }
  }
  if (!best) return null;

  // Slide along the wall out of any perpendicular wall it now runs into (e.g. in a corner).
  let pos: Point = { x: best.x, y: best.y };
  const dir = best.seg.dir;
  const others = segs.filter((s) => s !== best!.seg).map((s) => wallOutline(s, false));
  for (let iter = 0; iter < 3; iter++) {
    const corners = rectCorners(pos, item.width, item.depth, best.rotation);
    let moved = false;
    for (const outline of others) {
      if (!convexOverlap(corners, outline)) continue;
      const ip = corners.map((c) => dot(c, dir));
      const wp = outline.map((c) => dot(c, dir));
      const iMin = Math.min(...ip);
      const iMax = Math.max(...ip);
      const wMin = Math.min(...wp);
      const wMax = Math.max(...wp);
      const shift = (iMin + iMax) / 2 < (wMin + wMax) / 2 ? wMin - iMax : wMax - iMin;
      if (Math.abs(shift) > best.extentAlong * 2) continue;
      pos = add(pos, scale(dir, shift));
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return { x: pos.x, y: pos.y, rotation: best.rotation };
}

/** Distances from each side of an item to the nearest wall face along the item's axes. */
export function measureToWalls(item: Pick<FurnitureItem, 'x' | 'y' | 'width' | 'depth' | 'rotation'>, segs: WallSegment[], maxDistance = 1500): { from: Point; to: Point }[] {
  const c = { x: item.x, y: item.y };
  const dirs: [Point, number][] = [
    [{ x: 1, y: 0 }, item.width / 2],
    [{ x: -1, y: 0 }, item.width / 2],
    [{ x: 0, y: 1 }, item.depth / 2],
    [{ x: 0, y: -1 }, item.depth / 2],
  ];
  const result: { from: Point; to: Point }[] = [];
  for (const [local, half] of dirs) {
    const dir = rotate(local, item.rotation);
    const origin = add(c, scale(dir, half));
    let bestT = maxDistance;
    for (const seg of segs) {
      for (const sgn of [1, -1]) {
        const off = scale(seg.normal, (sgn * seg.wall.thickness) / 2);
        const t = raySegment(origin, dir, add(seg.a, off), add(seg.b, off));
        if (t !== null && t > 0.5 && t < bestT) bestT = t;
      }
    }
    if (bestT < maxDistance) result.push({ from: origin, to: add(origin, scale(dir, bestT)) });
  }
  return result;
}

function raySegment(o: Point, d: Point, a: Point, b: Point): number | null {
  const s = sub(b, a);
  const denom = cross(d, s);
  if (Math.abs(denom) < 1e-9) return null;
  const ao = sub(a, o);
  const t = cross(ao, s) / denom;
  const u = cross(ao, d) / denom;
  return t >= 0 && u >= 0 && u <= 1 ? t : null;
}

/** Ids of furniture items that overlap another item or a wall. Floor-layer items (rugs) are ignored. */
export function findOverlaps(furniture: FurnitureItem[], segs: WallSegment[]): Set<string> {
  const solid = furniture.filter((f) => !catalogItem(f.catalogId).floorLayer);
  const corners = solid.map((f) => rectCorners(f, f.width, f.depth, f.rotation));
  const walls = segs.map((s) => wallOutline(s, false));
  const out = new Set<string>();
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (convexOverlap(corners[i], corners[j])) {
        out.add(solid[i].id);
        out.add(solid[j].id);
      }
    }
    if (walls.some((w) => convexOverlap(corners[i], w))) out.add(solid[i].id);
  }
  return out;
}
