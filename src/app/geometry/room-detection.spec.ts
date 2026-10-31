import { createEmptyPlan } from '../model/defaults';
import { Plan, Point } from '../model/plan.model';
import { attachRoomMeta, detectRooms } from './room-detection';
import { addWall } from './wall-geometry';

const props = { thickness: 10, height: 240 };

function polyline(plan: Plan, pts: Point[], close = true): void {
  const n = close ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) addWall(plan, pts[i], pts[(i + 1) % pts.length], props);
}

describe('detectRooms', () => {
  it('finds a single square room', () => {
    const plan = createEmptyPlan();
    polyline(plan, [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ]);
    const rooms = detectRooms(plan);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(120000);
    expect(rooms[0].wallIds).toHaveLength(4);
  });

  it('finds an L-shaped room with a label inside it', () => {
    const plan = createEmptyPlan();
    polyline(plan, [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 200 },
      { x: 200, y: 200 },
      { x: 200, y: 600 },
      { x: 0, y: 600 },
    ]);
    const rooms = detectRooms(plan);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(600 * 200 + 200 * 400);
    const l = rooms[0].label;
    const inside = (l.y <= 200 && l.x <= 600) || (l.x <= 200 && l.y <= 600);
    expect(inside).toBe(true);
  });

  it('finds two rooms sharing a wall', () => {
    const plan = createEmptyPlan();
    polyline(plan, [
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 800, y: 400 },
      { x: 0, y: 400 },
    ]);
    // Divider splits the top and bottom walls into T-junctions.
    addWall(plan, { x: 300, y: 0 }, { x: 300, y: 400 }, props);
    const rooms = detectRooms(plan);
    expect(rooms).toHaveLength(2);
    const areas = rooms.map((r) => r.area).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(300 * 400);
    expect(areas[1]).toBeCloseTo(500 * 400);
  });

  it('finds no room for an open chain of walls', () => {
    const plan = createEmptyPlan();
    polyline(
      plan,
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 300 },
        { x: 0, y: 300 },
      ],
      false,
    );
    expect(detectRooms(plan)).toHaveLength(0);
  });

  it('still finds the room when a dangling wall pokes into it', () => {
    const plan = createEmptyPlan();
    polyline(plan, [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 400 },
      { x: 0, y: 400 },
    ]);
    addWall(plan, { x: 200, y: 0 }, { x: 200, y: 150 }, props);
    const rooms = detectRooms(plan);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(160000);
  });

  it('splits rooms where walls cross without a shared corner', () => {
    const plan = createEmptyPlan();
    polyline(plan, [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 400 },
      { x: 0, y: 400 },
    ]);
    addWall(plan, { x: 200, y: 0 }, { x: 200, y: 400 }, props);
    addWall(plan, { x: 0, y: 200 }, { x: 400, y: 200 }, props);
    expect(detectRooms(plan)).toHaveLength(4);
  });
});

describe('attachRoomMeta', () => {
  it('binds metadata by anchor point and falls back to defaults', () => {
    const plan = createEmptyPlan();
    polyline(plan, [
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 800, y: 400 },
      { x: 0, y: 400 },
    ]);
    addWall(plan, { x: 300, y: 0 }, { x: 300, y: 400 }, props);
    const rooms = attachRoomMeta(detectRooms(plan), [
      { id: 'r1', anchor: { x: 100, y: 100 }, name: 'Kitchen', floorColor: '#111111', wallColor: '#222222' },
    ]);
    const kitchen = rooms.find((r) => r.name === 'Kitchen');
    const other = rooms.find((r) => r.name === 'Room');
    expect(kitchen?.floorColor).toBe('#111111');
    expect(other?.meta).toBeNull();
  });
});
