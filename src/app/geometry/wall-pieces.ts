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

const MIN_SIZE = 0.01;

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
