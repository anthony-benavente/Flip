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

  it('lets items at different heights share a footprint', () => {
    const segs = wallSegments(room());
    const dresser = { ...createFurniture('dresser', { x: 200, y: 200 }), id: 'dresser' };
    const lamp = { ...createFurniture('table-lamp', { x: 200, y: 200 }), id: 'lamp', elevation: dresser.height };
    const sunk = { ...createFurniture('vase', { x: 240, y: 200 }), id: 'sunk', elevation: dresser.height - 10 };
    const elevationOf = (f: { elevation?: number }) => f.elevation ?? 0;
    expect(findOverlaps([dresser, lamp], segs, elevationOf).size).toBe(0);
    expect([...findOverlaps([dresser, lamp, sunk], segs, elevationOf)].sort()).toEqual(['dresser', 'sunk']);
  });

  it('lets wall-mounted items touch their wall', () => {
    const segs = wallSegments(room());
    const art = { ...createFurniture('art-small', { x: 200, y: 0 }), id: 'art' };
    art.y = 5 + art.depth / 2;
    const box = { ...createFurniture('box', { x: 10, y: 300 }), id: 'box' };
    expect([...findOverlaps([art, box], segs, (f) => f.elevation ?? 0)]).toEqual(['box']);
  });

  it('lets a chair or stool overlap a table or desk, but not other furniture', () => {
    const at = (catalogId: string, x: number, y: number, id: string) => ({ ...createFurniture(catalogId, { x, y }), id });
    const desk = at('desk', 300, 300, 'desk');
    expect(findOverlaps([desk, at('office-chair', 300, 340, 'chair')], []).size).toBe(0);
    expect(findOverlaps([desk, at('stool', 300, 320, 'stool')], []).size).toBe(0);
    expect(findOverlaps([desk, at('sofa-3', 300, 320, 'sofa')], []).size).toBe(2);
    expect(findOverlaps([at('sofa-3', 300, 300, 'sofa'), at('office-chair', 300, 320, 'chair')], []).size).toBe(2);
  });
});
