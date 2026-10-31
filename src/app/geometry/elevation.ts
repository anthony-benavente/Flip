import { catalogItem, mountOf } from '../model/catalog';
import { DEFAULT_WALL_HEIGHT } from '../model/defaults';
import { FurnitureItem, Point, WallSide } from '../model/plan.model';
import { Room, roomAt } from './room-detection';
import { add, dot, pointInPolygon, rectCorners, rotate, scale, sub } from './vec';
import { sideOfWall, WallSegment } from './wall-geometry';

/** Stacked items count as resting on a surface when their bottom is within this of its top. */
const REST_TOLERANCE = 0.5;
/** A wall item's back must be within this of a wall face to hang on it. */
const MOUNT_TOLERANCE = 5;

/** Height of the ceiling above a point: the room's tallest wall, or the default wall height outside rooms. */
export function ceilingHeightAt(rooms: Room[], p: Point): number {
  return roomAt(rooms, p)?.ceilingHeight ?? DEFAULT_WALL_HEIGHT;
}

/**
 * Height of an item's bottom above the floor. Ceiling items hang so their top touches the ceiling;
 * everything else uses its stored `elevation`.
 */
export function itemElevation(item: FurnitureItem, rooms: Room[]): number {
  if (mountOf(catalogItem(item.catalogId)) === 'ceiling') return Math.max(0, ceilingHeightAt(rooms, item) - item.height);
  return Number.isFinite(item.elevation) ? Math.max(0, item.elevation!) : 0;
}

export function itemTop(item: FurnitureItem, rooms: Room[]): number {
  return itemElevation(item, rooms) + item.height;
}

function footprint(f: FurnitureItem): Point[] {
  return rectCorners(f, f.width, f.depth, f.rotation);
}

/** Whether `item` (or a candidate position for it) can rest on `support`. */
function canSupport(support: FurnitureItem): boolean {
  const c = catalogItem(support.catalogId);
  return mountOf(c) === 'floor' && !c.floorLayer;
}

/**
 * Bottom height for a stackable item at its current position: the top of the highest floor item
 * under its center, or 0. Items already resting on `item` are never used as its support.
 */
export function restingElevation(item: FurnitureItem, furniture: FurnitureItem[], rooms: Room[]): number {
  const above = new Set(itemsRestingOn(item, furniture, rooms).map((f) => f.id));
  let best = 0;
  for (const f of furniture) {
    if (f.id === item.id || above.has(f.id) || !canSupport(f)) continue;
    if (!pointInPolygon(item, footprint(f))) continue;
    best = Math.max(best, itemTop(f, rooms));
  }
  return best;
}

/** Stackable items resting on `base`, directly or on top of each other, so they move with it. */
export function itemsRestingOn(base: FurnitureItem, furniture: FurnitureItem[], rooms: Room[]): FurnitureItem[] {
  const result: FurnitureItem[] = [];
  const seen = new Set([base.id]);
  const queue = [base];
  while (queue.length) {
    const support = queue.shift()!;
    const top = itemTop(support, rooms);
    const outline = footprint(support);
    for (const f of furniture) {
      if (seen.has(f.id)) continue;
      const c = catalogItem(f.catalogId);
      if (!c.stackable || mountOf(c) !== 'floor') continue;
      if (Math.abs(itemElevation(f, rooms) - top) > REST_TOLERANCE || !pointInPolygon(f, outline)) continue;
      seen.add(f.id);
      result.push(f);
      queue.push(f);
    }
  }
  return result;
}

export interface WallMount {
  seg: WallSegment;
  side: WallSide;
  /** Distance of the item's center from wall node `a`, along the wall. */
  along: number;
}

/** The wall face a wall-mounted item hangs on: its back is flush with the face and turned toward it. */
export function mountedWall(item: FurnitureItem, segs: WallSegment[]): WallMount | null {
  if (mountOf(catalogItem(item.catalogId)) !== 'wall') return null;
  const backDir = rotate({ x: 0, y: -1 }, item.rotation);
  const back = add(item, scale(backDir, item.depth / 2));
  let best: (WallMount & { gap: number }) | null = null;
  for (const seg of segs) {
    const along = dot(sub(back, seg.a), seg.dir);
    if (along < 0 || along > seg.length) continue;
    const s = sideOfWall(seg, back);
    const gap = Math.abs(Math.abs(s) - seg.wall.thickness / 2);
    const outward = scale(seg.normal, s >= 0 ? 1 : -1);
    if (gap > MOUNT_TOLERANCE || dot(backDir, outward) > -0.9) continue;
    if (!best || gap < best.gap) best = { seg, side: s >= 0 ? 'front' : 'back', along: dot(sub(item, seg.a), seg.dir), gap };
  }
  return best && { seg: best.seg, side: best.side, along: best.along };
}
