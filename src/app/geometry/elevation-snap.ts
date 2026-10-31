/**
 * Snapping for items dragged on a wall face in the elevation view. Works in face coordinates:
 * `x` runs along the face as the viewer sees it and heights are measured up from the floor (cm).
 */

/** An item on the face: its left edge, width, bottom and height. */
export interface FaceBox {
  x: number;
  w: number;
  bottom: number;
  h: number;
}

export interface FaceSnapTargets {
  /** Heights an item's center lines up with, such as eye level. */
  centerLevels: number[];
  /** Heights an item's bottom, center or top lines up with: other items' edges and furniture tops. */
  levels: number[];
  /** Horizontal positions an item's center lines up with: furniture below, other items. */
  centers: number[];
  /** Horizontal positions an item's left or right edge lines up with. */
  edges: number[];
  grid: number;
  tolerance: number;
}

export interface FaceSnap {
  x: number;
  bottom: number;
  /** Lines to draw for the alignments found. */
  guides: { x?: number; height?: number }[];
}

/** Moves a box to the nearest alignment on each axis, or onto the grid when nothing is close. */
export function snapOnFace(box: FaceBox, t: FaceSnapTargets): FaceSnap {
  const guides: FaceSnap['guides'] = [];

  const horizontal = nearest([
    ...t.centers.map((c) => ({ value: c - box.w / 2, line: c, d: Math.abs(box.x + box.w / 2 - c) })),
    ...t.edges.flatMap((e) => [
      { value: e, line: e, d: Math.abs(box.x - e) },
      { value: e - box.w, line: e, d: Math.abs(box.x + box.w - e) },
    ]),
  ], t.tolerance);
  let x = Math.round((box.x + box.w / 2) / t.grid) * t.grid - box.w / 2;
  if (horizontal) {
    x = horizontal.value;
    guides.push({ x: horizontal.line });
  }

  const vertical = nearest([
    ...t.centerLevels.map((l) => ({ value: l - box.h / 2, line: l, d: Math.abs(box.bottom + box.h / 2 - l) })),
    ...t.levels.flatMap((l) => [
      { value: l, line: l, d: Math.abs(box.bottom - l) },
      { value: l - box.h / 2, line: l, d: Math.abs(box.bottom + box.h / 2 - l) },
      { value: l - box.h, line: l, d: Math.abs(box.bottom + box.h - l) },
    ]),
  ], t.tolerance);
  let bottom = Math.round(box.bottom / t.grid) * t.grid;
  if (vertical) {
    bottom = vertical.value;
    guides.push({ height: vertical.line });
  }

  return { x, bottom, guides };
}

function nearest<T extends { d: number }>(candidates: T[], tolerance: number): T | null {
  let best: T | null = null;
  for (const c of candidates) if (c.d <= tolerance && (!best || c.d < best.d)) best = c;
  return best;
}
