import { createEmptyPlan } from '../model/defaults';
import {
  addWall,
  clampOpeningOffset,
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
