import { createEmptyPlan, createFurniture } from '../model/defaults';
import { findOverlaps, measureToWalls, snapFurnitureToWall } from './furniture-geometry';
import { addWall, wallSegments } from './wall-geometry';

const props = { thickness: 10, height: 240 };

function room() {
  const p = createEmptyPlan();
  const pts = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 400 },
    { x: 0, y: 400 },
  ];
  for (let i = 0; i < 4; i++) addWall(p, pts[i], pts[(i + 1) % 4], props);
  return p;
}

describe('snapFurnitureToWall', () => {
  it('puts the back edge flush against the nearest wall face', () => {
    const segs = wallSegments(room());
    const item = { width: 200, depth: 90, rotation: 0 };
    const r = snapFurnitureToWall({ x: 200, y: 60 }, item, segs, 60, true)!;
    expect(r).not.toBeNull();
    // Top wall is at y=0 with thickness 10: face at y=5, so center at 5 + 45.
    expect(r.y).toBeCloseTo(50);
    expect(Math.abs(r.rotation) % 360).toBeCloseTo(0);
  });

  it('turns the back toward a side wall', () => {
    const segs = wallSegments(room());
    const r = snapFurnitureToWall({ x: 60, y: 200 }, { width: 200, depth: 90, rotation: 0 }, segs, 60, true)!;
    expect(r.x).toBeCloseTo(50);
    // Back (local -y) faces the left wall (-x) at -90 degrees.
    expect(r.rotation).toBeCloseTo(-90);
  });

  it('slides out of a corner when the drop overlaps the perpendicular wall', () => {
    const segs = wallSegments(room());
    const r = snapFurnitureToWall({ x: 30, y: 20 }, { width: 200, depth: 90, rotation: 0 }, segs, 40, true)!;
    // Snaps to the top wall (closest face) and slides right until clear of the left wall face at x=5.
    expect(r.y).toBeCloseTo(50);
    expect(r.x).toBeCloseTo(105);
    expect(findOverlaps([{ ...createFurniture('box', r), ...r, width: 200, depth: 90, id: 'x' }], segs).size).toBe(0);
  });

  it('ignores walls that are far away', () => {
    const segs = wallSegments(room());
    expect(snapFurnitureToWall({ x: 200, y: 200 }, { width: 50, depth: 50, rotation: 0 }, segs, 20)).toBeNull();
  });
});

describe('measureToWalls', () => {
  it('measures to each surrounding wall face', () => {
    const segs = wallSegments(room());
    const f = { x: 200, y: 200, width: 100, depth: 100, rotation: 0 };
    const m = measureToWalls(f, segs);
    expect(m).toHaveLength(4);
    for (const { from, to } of m) expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeCloseTo(145);
  });
});

describe('findOverlaps', () => {
  it('flags overlapping furniture and furniture inside walls, but not rugs', () => {
    const segs = wallSegments(room());
    const a = { ...createFurniture('box', { x: 100, y: 100 }), id: 'a' };
    const b = { ...createFurniture('box', { x: 120, y: 120 }), id: 'b' };
    const c = { ...createFurniture('box', { x: 10, y: 300 }), id: 'c' };
    const rug = { ...createFurniture('rug-large', { x: 200, y: 200 }), id: 'rug' };
    const free = { ...createFurniture('box', { x: 300, y: 300 }), id: 'free' };
    const hits = findOverlaps([a, b, c, rug, free], segs);
    expect([...hits].sort()).toEqual(['a', 'b', 'c']);
  });
});
