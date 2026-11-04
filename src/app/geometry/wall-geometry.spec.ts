import { createEmptyPlan } from '../model/defaults';
import {
  addWall,
  clampOpeningOffset,
  endExtensions,
  faceTrimGaps,
  subtractGaps,
  mergeNodes,
  nodeMap,
  removeWalls,
  setWallLength,
  splitWall,
  wallSegment,
  wallSegments,
} from './wall-geometry';

const props = { thickness: 10, height: 240 };

describe('wall editing', () => {
  it('shares corners between connected walls', () => {
    const plan = createEmptyPlan();
    addWall(plan, { x: 0, y: 0 }, { x: 100, y: 0 }, props);
    addWall(plan, { x: 100, y: 0 }, { x: 100, y: 100 }, props);
    expect(plan.nodes).toHaveLength(3);
    expect(plan.walls).toHaveLength(2);
  });

  it('ignores zero-length and duplicate walls', () => {
    const plan = createEmptyPlan();
    addWall(plan, { x: 0, y: 0 }, { x: 100, y: 0 }, props);
    expect(addWall(plan, { x: 0, y: 0 }, { x: 0.5, y: 0 }, props).wallIds).toHaveLength(0);
    expect(addWall(plan, { x: 100, y: 0 }, { x: 0, y: 0 }, props).wallIds).toHaveLength(0);
    expect(plan.walls).toHaveLength(1);
    expect(plan.nodes).toHaveLength(2);
  });

  it('splits a wall into a T-junction when a new wall ends on it', () => {
    const plan = createEmptyPlan();
    addWall(plan, { x: 0, y: 0 }, { x: 400, y: 0 }, props);
    addWall(plan, { x: 150, y: 0 }, { x: 150, y: 200 }, props);
    expect(plan.walls).toHaveLength(3);
    const lengths = wallSegments(plan)
      .map((s) => s.length)
      .sort((a, b) => a - b);
    expect(lengths).toEqual([150, 200, 250]);
  });

  it('moves openings onto the correct piece when splitting', () => {
    const plan = createEmptyPlan();
    const { wallIds } = addWall(plan, { x: 0, y: 0 }, { x: 400, y: 0 }, props);
    plan.openings.push({ id: 'o1', wallId: wallIds[0], kind: 'window', offset: 300, width: 80, height: 100, sillHeight: 90 });
    splitWall(plan, wallIds[0], { x: 150, y: 0 });
    const o = plan.openings[0];
    expect(o.wallId).not.toBe(wallIds[0]);
    expect(o.offset).toBeCloseTo(150);
  });

  it('keeps accent colors on both pieces when a wall is split', () => {
    const plan = createEmptyPlan();
    const { wallIds } = addWall(plan, { x: 0, y: 0 }, { x: 400, y: 0 }, props);
    plan.walls[0].colors = { front: '#2f4a6d' };
    splitWall(plan, wallIds[0], { x: 150, y: 0 });
    expect(plan.walls.map((w) => w.colors)).toEqual([{ front: '#2f4a6d' }, { front: '#2f4a6d' }]);
    // The pieces must not share one colors object, or editing one would repaint the other.
    expect(plan.walls[0].colors).not.toBe(plan.walls[1].colors);
  });

  it('merges corners and drops degenerate walls', () => {
    const plan = createEmptyPlan();
    addWall(plan, { x: 0, y: 0 }, { x: 100, y: 0 }, props);
    addWall(plan, { x: 100, y: 0 }, { x: 100, y: 100 }, props);
    const nodes = nodeMap(plan);
    const corner = [...nodes.values()].find((n) => n.x === 100 && n.y === 100)!;
    const origin = [...nodes.values()].find((n) => n.x === 0 && n.y === 0)!;
    const mid = [...nodes.values()].find((n) => n.x === 100 && n.y === 0)!;
    mergeNodes(plan, corner.id, mid.id);
    expect(plan.walls).toHaveLength(1);
    expect(plan.nodes.map((n) => n.id).sort()).toEqual([origin.id, mid.id].sort());
  });

  it('sets a wall length along its direction and re-clamps openings', () => {
    const plan = createEmptyPlan();
    const { wallIds } = addWall(plan, { x: 0, y: 0 }, { x: 400, y: 0 }, props);
    plan.openings.push({ id: 'o1', wallId: wallIds[0], kind: 'door', offset: 350, width: 80, height: 200, sillHeight: 0 });
    setWallLength(plan, wallIds[0], 200);
    const seg = wallSegment(plan.walls[0], nodeMap(plan))!;
    expect(seg.length).toBeCloseTo(200);
    expect(plan.openings[0].offset).toBeCloseTo(160);
  });

  it('removes openings and orphan corners with their wall', () => {
    const plan = createEmptyPlan();
    const { wallIds } = addWall(plan, { x: 0, y: 0 }, { x: 400, y: 0 }, props);
    plan.openings.push({ id: 'o1', wallId: wallIds[0], kind: 'door', offset: 100, width: 80, height: 200, sillHeight: 0 });
    removeWalls(plan, wallIds);
    expect(plan.walls).toHaveLength(0);
    expect(plan.nodes).toHaveLength(0);
    expect(plan.openings).toHaveLength(0);
  });
});

describe('clampOpeningOffset', () => {
  it('keeps openings within the wall', () => {
    expect(clampOpeningOffset(10, 80, 400)).toBe(40);
    expect(clampOpeningOffset(390, 80, 400)).toBe(360);
    expect(clampOpeningOffset(200, 80, 400)).toBe(200);
    expect(clampOpeningOffset(10, 500, 400)).toBe(200);
  });
});

describe('faceTrimGaps', () => {
  const seg = (id: string, a: { x: number; y: number }, b: { x: number; y: number }) =>
    wallSegment({ id, a: `${id}a`, b: `${id}b`, thickness: 10, height: 240 } as never, new Map([[`${id}a`, { id: `${id}a`, ...a }], [`${id}b`, { id: `${id}b`, ...b }]]))!;

  it('stops trim at a wall that joins the face, and ignores the far side', () => {
    const main = seg('m', { x: 0, y: 0 }, { x: 400, y: 0 });
    const stem = seg('s', { x: 400, y: 0 }, { x: 400, y: 300 });
    // normal of main points +y, the stem's side: the front face is blocked for the last 5 cm.
    const [g0, g1] = faceTrimGaps(main, 'front', [main, stem])[0];
    expect(g0).toBeCloseTo(195);
    expect(g1).toBeGreaterThan(200);
    expect(faceTrimGaps(main, 'back', [main, stem])).toEqual([]);
  });

  it('lets trim run through a collinear continuation up to the shared node', () => {
    const a = seg('a', { x: 0, y: 0 }, { x: 100, y: 0 });
    const b = seg('b', { x: 100, y: 0 }, { x: 200, y: 0 });
    const [g0] = faceTrimGaps(a, 'front', [a, b])[0];
    expect(g0).toBeCloseTo(50);
  });

  it('subtracts gaps from a range', () => {
    expect(subtractGaps(0, 100, [[-5, 10], [90, 120]])).toEqual([[10, 90]]);
    expect(subtractGaps(0, 100, [])).toEqual([[0, 100]]);
  });
});

describe('endExtensions', () => {
  const seg = (id: string, a: { x: number; y: number }, b: { x: number; y: number }) =>
    wallSegment({ id, a: `${id}a`, b: `${id}b`, thickness: 10, height: 240 } as never, new Map([[`${id}a`, { id: `${id}a`, ...a }], [`${id}b`, { id: `${id}b`, ...b }]]))!;

  it('keeps the extension on a free end and at the lower-id wall of a corner', () => {
    const a = seg('a', { x: 0, y: 0 }, { x: 100, y: 0 });
    const b = seg('b', { x: 100, y: 0 }, { x: 100, y: 100 });
    expect(endExtensions(a, [a, b])).toEqual({ a: 5, b: 5 });
  });

  it('lets only one wall fill the outer square of a 90 degree corner', () => {
    const nodes = new Map([
      ['n0', { id: 'n0', x: 0, y: 0 }],
      ['n1', { id: 'n1', x: 100, y: 0 }],
      ['n2', { id: 'n2', x: 100, y: 100 }],
    ]);
    const a = wallSegment({ id: 'a', a: 'n0', b: 'n1', thickness: 10, height: 240 } as never, nodes)!;
    const b = wallSegment({ id: 'b', a: 'n1', b: 'n2', thickness: 10, height: 240 } as never, nodes)!;
    expect(endExtensions(a, [a, b]).b).toBe(5);
    expect(endExtensions(b, [a, b]).a).toBe(0);
  });

  it('drops it where a wall ends inside two collinear walls (T-junction)', () => {
    const left = seg('l', { x: 0, y: 0 }, { x: 100, y: 0 });
    const right = seg('r', { x: 100, y: 0 }, { x: 200, y: 0 });
    const stem = seg('s', { x: 100, y: 0 }, { x: 100, y: 100 });
    expect(endExtensions(stem, [left, right, stem]).a).toBe(0);
    expect(endExtensions(stem, [left, right, stem]).b).toBe(5);
  });

  it('drops it between collinear walls', () => {
    const a = seg('a', { x: 0, y: 0 }, { x: 100, y: 0 });
    const b = seg('b', { x: 100, y: 0 }, { x: 200, y: 0 });
    expect(endExtensions(a, [a, b])).toEqual({ a: 5, b: 0 });
  });
});
