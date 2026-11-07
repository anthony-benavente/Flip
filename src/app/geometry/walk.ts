/** Walk-through math: where a visitor starts and how walls stop them. Pure, in plan centimeters. */
import { Opening, Point } from '../model/plan.model';
import { Room } from './room-detection';
import { WallSegment, endExtensions } from './wall-geometry';
import { RAILING, wallPieces } from './wall-pieces';
import { add, dot, scale, sub } from './vec';

/** Eye height above the floor and the radius of the visitor's body. */
export const WALK_EYE_HEIGHT = 160;
export const WALK_RADIUS = 20;
/** Anything lower than this blocks the body; the head of a doorway above it does not. */
const BODY_HEIGHT = 170;

/** A wall piece as an oriented box: `x0..x1` along `dir` from `origin`, `half` either side across it. */
export interface Obstacle {
  origin: Point;
  dir: Point;
  normal: Point;
  x0: number;
  x1: number;
  half: number;
}

/**
 * The boxes that stop a visitor. Doorways stay open, window sills and railings block, and hidden
 * walls (room dividers that build nothing) do not.
 */
export function walkObstacles(segments: WallSegment[], openings: Opening[]): Obstacle[] {
  const out: Obstacle[] = [];
  for (const seg of segments) {
    if (seg.wall.type === 'hidden') continue;
    const origin = add(seg.a, scale(seg.dir, seg.length / 2));
    const box = { origin, dir: seg.dir, normal: seg.normal };
    if (seg.wall.type === 'railing') {
      out.push({ ...box, x0: -seg.length / 2, x1: seg.length / 2, half: RAILING.post / 2 });
      continue;
    }
    const mine = openings.filter((o) => o.wallId === seg.wall.id);
    const pieces = wallPieces({ length: seg.length, thickness: seg.wall.thickness, height: seg.wall.height }, mine, endExtensions(seg, segments));
    for (const s of pieces.solids) {
      if (s.y0 < BODY_HEIGHT) out.push({ ...box, x0: s.x0, x1: s.x1, half: seg.wall.thickness / 2 });
    }
  }
  return out;
}

/** Moves `from` by `delta`, then pushes the body out of every obstacle so it slides along walls. */
export function walkMove(from: Point, delta: Point, obstacles: Obstacle[], radius = WALK_RADIUS): Point {
  let p = add(from, delta);
  // A few passes settle corners where two pieces push in different directions.
  for (let pass = 0; pass < 3; pass++) {
    for (const o of obstacles) p = pushOut(p, o, radius);
  }
  return p;
}

function pushOut(p: Point, o: Obstacle, radius: number): Point {
  const rel = sub(p, o.origin);
  const x = dot(rel, o.dir);
  const y = dot(rel, o.normal);
  const cx = Math.min(Math.max(x, o.x0), o.x1);
  const cy = Math.min(Math.max(y, -o.half), o.half);
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= radius) return p;
  let nx: number;
  let ny: number;
  let push: number;
  if (d > 1e-9) {
    nx = dx / d;
    ny = dy / d;
    push = radius - d;
  } else {
    // Center inside the box: leave through the nearest face.
    const left = x - o.x0;
    const right = o.x1 - x;
    const across = o.half - Math.abs(y);
    if (across <= Math.min(left, right)) {
      nx = 0;
      ny = y >= 0 ? 1 : -1;
      push = across + radius;
    } else {
      nx = left < right ? -1 : 1;
      ny = 0;
      push = Math.min(left, right) + radius;
    }
  }
  return add(p, add(scale(o.dir, nx * push), scale(o.normal, ny * push)));
}

/** Where a visit begins: the middle of the preferred room, else the biggest one, else the origin. Faces +x (yaw 0). */
export function walkStart(rooms: Room[], preferKey?: string | null): Point {
  const room = rooms.find((r) => r.key === preferKey) ?? [...rooms].sort((a, b) => b.area - a.area)[0];
  return room ? room.label : { x: 0, y: 0 };
}
