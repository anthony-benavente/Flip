import { Opening } from '../model/plan.model';

/** Axis-aligned rectangle in a wall's local frame: x along the wall (centered on its midpoint), y up. Centimeters. */
export interface WallBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface OpeningSpan {
  opening: Opening;
  x0: number;
  x1: number;
  sill: number;
  top: number;
}

export interface WallPieces {
  solids: WallBox[];
  openings: OpeningSpan[];
}

/** Trim sizes in centimeters, shared by the 3D view and the elevation drawing. */
export const BASEBOARD = { height: 10, depth: 1.5 };
export const CROWN = { height: 8, depth: 4 };
export const CASING = { width: 7, depth: 1.5 };
/** Railing sizes in centimeters: a 36" guard with balusters under 4" apart. */
export const RAILING = { height: 91.5, postEvery: 150, post: 9, handrail: 7, baluster: 2.5, gap: 10 };

const MIN_SIZE = 0.01;

/** A railing part in the wall's frame: x along the wall (centered), y up, `depth` across it. */
export interface RailPart {
  kind: 'post' | 'handrail' | 'bottom-rail' | 'baluster';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  depth: number;
}

/** Posts at both ends and about every `RAILING.postEvery`, a handrail and bottom rail, and balusters between the posts. */
export function railingParts(length: number): RailPart[] {
  const { height: H, post, handrail, baluster, gap, postEvery } = RAILING;
  const parts: RailPart[] = [];
  const bottom = { y0: 5, y1: 10 };
  const spans = Math.max(1, Math.ceil(length / postEvery));
  const postAt = (i: number) => -length / 2 + (length * i) / spans;
  for (let i = 0; i <= spans; i++) parts.push({ kind: 'post', x0: postAt(i) - post / 2, x1: postAt(i) + post / 2, y0: 0, y1: H + 2, depth: post });
  parts.push({ kind: 'handrail', x0: -length / 2, x1: length / 2, y0: H - 5, y1: H, depth: handrail });
  parts.push({ kind: 'bottom-rail', x0: -length / 2, x1: length / 2, ...bottom, depth: 4 });
  for (let i = 0; i < spans; i++) {
    const from = postAt(i) + post / 2;
    const to = postAt(i + 1) - post / 2;
    const count = Math.max(0, Math.ceil((to - from - gap) / (baluster + gap)));
    // Equal gaps between the posts and every baluster.
    const space = (to - from - count * baluster) / (count + 1);
    for (let k = 0; k < count; k++) {
      const x0 = from + space * (k + 1) + baluster * k;
      parts.push({ kind: 'baluster', x0, x1: x0 + baluster, y0: bottom.y1, y1: H - 5, depth: baluster });
    }
  }
  return parts;
}

/**
 * Splits a wall into solid boxes around its door and window openings.
 * Each end is extended (by half the wall's thickness unless `ends` says otherwise) so corners close, matching the 2D plan's square caps.
 */
export function wallPieces(
  wall: { length: number; thickness: number; height: number },
  openings: Opening[],
  /** How far each end extends past its node; defaults to half the thickness. */
  ends: { a: number; b: number } = { a: wall.thickness / 2, b: wall.thickness / 2 },
): WallPieces {
  const { length: L, thickness: t, height: H } = wall;
  const solids: WallBox[] = [];
  const spans: OpeningSpan[] = [];
  const push = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 >= MIN_SIZE && y1 - y0 >= MIN_SIZE) solids.push({ x0, x1, y0, y1 });
  };

  const start = -L / 2 - ends.a;
  const end = L / 2 + ends.b;
  let cursor = start;
  for (const o of [...openings].sort((a, b) => a.offset - b.offset)) {
    const x0 = Math.max(cursor, o.offset - o.width / 2 - L / 2);
    const x1 = Math.min(end, o.offset + o.width / 2 - L / 2);
    if (x1 <= x0) continue;
    const sill = Math.min(H, Math.max(0, o.sillHeight));
    const top = Math.min(H, o.sillHeight + o.height);
    push(cursor, x0, 0, H);
    push(x0, x1, top, H);
    push(x0, x1, 0, sill);
    spans.push({ opening: o, x0, x1, sill, top });
    cursor = x1;
  }
  push(cursor, end, 0, H);
  return { solids, openings: spans };
}
