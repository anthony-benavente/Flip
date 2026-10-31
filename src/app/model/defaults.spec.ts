import { detectRooms, attachRoomMeta } from '../geometry/room-detection';
import { SQCM_PER_SQFT } from '../geometry/units';
import { wallSegments } from '../geometry/wall-geometry';
import { catalogItem } from './catalog';
import { createEmptyPlan, createFurniture, createStarterPlan } from './defaults';
import { CURRENT_SCHEMA_VERSION } from './plan.model';

describe('createStarterPlan', () => {
  const plan = createStarterPlan('Test');

  it('is a closed 12 x 14 ft living room', () => {
    expect(plan.walls).toHaveLength(4);
    expect(plan.nodes).toHaveLength(4);
    const rooms = attachRoomMeta(detectRooms(plan), plan.rooms);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area / SQCM_PER_SQFT).toBeCloseTo(168, 5);
    expect(rooms[0].name).toBe('Living room');
  });

  it('has one door and one window that fit on their walls', () => {
    expect(plan.openings.map((o) => o.kind).sort()).toEqual(['door', 'window']);
    const segs = new Map(wallSegments(plan).map((s) => [s.wall.id, s]));
    for (const o of plan.openings) {
      const seg = segs.get(o.wallId)!;
      expect(seg).toBeDefined();
      expect(o.offset - o.width / 2).toBeGreaterThanOrEqual(0);
      expect(o.offset + o.width / 2).toBeLessThanOrEqual(seg.length);
      expect(o.sillHeight + o.height).toBeLessThanOrEqual(seg.wall.height);
    }
  });

  it('gets a fresh id each time', () => {
    expect(createStarterPlan().id).not.toBe(createStarterPlan().id);
  });
});

describe('createEmptyPlan', () => {
  it('starts empty with the current schema', () => {
    const p = createEmptyPlan('Blank', 'metric');
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(p.displayUnits).toBe('metric');
    expect([p.nodes, p.walls, p.openings, p.furniture, p.rooms].every((a) => a.length === 0)).toBe(true);
  });
});

describe('createFurniture', () => {
  it('copies catalog size and color', () => {
    const f = createFurniture('bed-queen', { x: 10, y: 20 }, 90);
    const c = catalogItem('bed-queen');
    expect(f).toMatchObject({ catalogId: 'bed-queen', x: 10, y: 20, rotation: 90, width: c.width, depth: c.depth, height: c.height, color: c.color });
  });
});
