import { createEmptyPlan, createFurniture, DEFAULT_WALL_HEIGHT } from '../model/defaults';
import { FurnitureItem, Plan } from '../model/plan.model';
import { squareRoom } from '../testing/fixtures';
import { ceilingHeightAt, itemElevation, itemsRestingOn, mountedWall, restingElevation } from './elevation';
import { attachRoomMeta, detectRooms } from './room-detection';
import { wallSegments } from './wall-geometry';

function setup(edit?: (plan: Plan) => void) {
  const plan = createEmptyPlan();
  squareRoom(plan, 400, 300);
  edit?.(plan);
  const rooms = attachRoomMeta(detectRooms(plan), plan.rooms);
  return { plan, rooms, segs: wallSegments(plan) };
}

function item(catalogId: string, x: number, y: number, extra: Partial<FurnitureItem> = {}): FurnitureItem {
  return { ...createFurniture(catalogId, { x, y }), ...extra };
}

describe('ceilingHeightAt', () => {
  it('uses the tallest wall of the room, or the default outside rooms', () => {
    const { rooms } = setup((p) => (p.walls[1].height = 300));
    expect(rooms[0].ceilingHeight).toBe(300);
    expect(ceilingHeightAt(rooms, { x: 200, y: 150 })).toBe(300);
    expect(ceilingHeightAt(rooms, { x: -500, y: 0 })).toBe(DEFAULT_WALL_HEIGHT);
  });
});

describe('itemElevation', () => {
  const { rooms } = setup();

  it('hangs ceiling items from the ceiling', () => {
    const pendant = item('pendant', 200, 150);
    expect(itemElevation(pendant, rooms)).toBeCloseTo(240 - pendant.height, 5);
  });

  it('reads the stored elevation and treats missing or bad values as the floor', () => {
    expect(itemElevation(item('sofa-3', 200, 150), rooms)).toBe(0);
    expect(itemElevation(item('art-small', 200, 150, { elevation: 120 }), rooms)).toBe(120);
    expect(itemElevation(item('sofa-3', 200, 150, { elevation: NaN }), rooms)).toBe(0);
    expect(itemElevation(item('sofa-3', 200, 150, { elevation: -20 }), rooms)).toBe(0);
  });
});

describe('stacking', () => {
  const { rooms } = setup();
  const dresser = item('dresser', 200, 100);
  const books = item('books', 200, 100, { elevation: dresser.height });
  const vase = item('vase', 200, 100, { elevation: dresser.height + books.height });
  const rug = item('rug-large', 200, 150);

  it('rests on the highest floor item under its center', () => {
    expect(restingElevation(item('table-lamp', 200, 100), [rug, dresser], rooms)).toBe(dresser.height);
    expect(restingElevation(item('table-lamp', 200, 100), [rug, dresser, books], rooms)).toBe(dresser.height + books.height);
  });

  it('sits on the floor when nothing is under it, ignoring rugs', () => {
    expect(restingElevation(item('table-lamp', 350, 250), [rug, dresser], rooms)).toBe(0);
  });

  it('never rests on items stacked on itself', () => {
    expect(restingElevation(books, [dresser, books, vase], rooms)).toBe(dresser.height);
  });

  it('finds everything resting on a base, through stacks', () => {
    const away = item('vase', 350, 250);
    const ids = itemsRestingOn(dresser, [dresser, books, vase, away, rug], rooms).map((f) => f.id);
    expect(ids.sort()).toEqual([books.id, vase.id].sort());
    expect(itemsRestingOn(books, [dresser, books, vase], rooms).map((f) => f.id)).toEqual([vase.id]);
  });

  it('sets a kitchen sink into an island top, and moves it with the island', () => {
    const island = item('island', 200, 150);
    const sink = item('kitchen-sink', 200, 150);
    sink.elevation = restingElevation(sink, [island, sink], rooms);
    expect(sink.elevation).toBe(island.height);
    expect(itemsRestingOn(island, [island, sink], rooms).map((f) => f.id)).toEqual([sink.id]);
  });

  it('sets a cooktop into a counter top', () => {
    const counter = item('counter', 200, 100);
    expect(restingElevation(item('cooktop', 200, 100), [counter], rooms)).toBe(counter.height);
  });
});

describe('mountedWall', () => {
  const { segs } = setup();

  it('finds the face a wall item hangs on', () => {
    // The top wall runs along y = 0 and is 10 thick; its room-side face is at y = 5.
    const art = item('art-small', 120, 0);
    art.y = 5 + art.depth / 2;
    const mount = mountedWall(art, segs);
    expect(mount).not.toBeNull();
    expect(mount!.seg.a.y).toBe(0);
    expect(mount!.seg.b.y).toBe(0);
    expect(mount!.side).toBe('front');
    expect(mount!.along).toBeCloseTo(mount!.seg.dir.x > 0 ? 120 : 280, 5);
  });

  it('ignores items facing the wall, away from it, or not hung on walls', () => {
    const art = item('art-small', 120, 50);
    expect(mountedWall(art, segs)).toBeNull();
    const backwards = item('art-small', 120, 5 + art.depth / 2, { rotation: 180 });
    expect(mountedWall(backwards, segs)).toBeNull();
    expect(mountedWall(item('sofa-3', 120, 50), segs)).toBeNull();
  });
});
