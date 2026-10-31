import { attachRoomMeta, detectRooms } from '../geometry/room-detection';
import { wallSegments } from '../geometry/wall-geometry';
import { squareRoom } from '../testing/fixtures';
import { catalogItem } from './catalog';
import { createEmptyPlan, createFurniture } from './defaults';
import {
  normalizeRotation,
  remapFurnitureModels,
  resetFurnitureSize,
  setFurnitureModel,
  setWallColor,
  updateFurniture,
  updateOpening,
  updateWall,
  upsertRoomMeta,
} from './plan-operations';
import { Plan } from './plan.model';

function setup(): { plan: Plan; walls: string[] } {
  const plan = createEmptyPlan();
  const walls = squareRoom(plan, 400, 300);
  plan.openings.push({ id: 'o1', wallId: walls[0], kind: 'door', offset: 200, width: 80, height: 200, sillHeight: 0 });
  plan.furniture.push({ ...createFurniture('sofa-3', { x: 200, y: 150 }), id: 'f1' });
  return { plan, walls };
}

describe('plan operations', () => {
  it.each([
    [0, 0],
    [180, 180],
    [190, -170],
    [-180, 180],
    [270, -90],
    [-450, -90],
    [720, 0],
  ])('normalizes %s° to %s°', (input, expected) => {
    expect(normalizeRotation(input)).toBe(expected);
  });

  it('updates wall thickness and height', () => {
    const { plan, walls } = setup();
    updateWall(plan, walls[0], { thickness: 20, height: 300 });
    expect(plan.walls[0]).toMatchObject({ thickness: 20, height: 300 });
    updateWall(plan, 'missing', { thickness: 1 });
  });

  describe('setWallColor', () => {
    it('sets and clears each face independently', () => {
      const { plan, walls } = setup();
      setWallColor(plan, walls[0], 'front', '#111111');
      setWallColor(plan, walls[0], 'back', '#222222');
      expect(plan.walls[0].colors).toEqual({ front: '#111111', back: '#222222' });
      setWallColor(plan, walls[0], 'front', null);
      expect(plan.walls[0].colors).toEqual({ back: '#222222' });
    });

    it('drops the colors object when no face has an accent', () => {
      const { plan, walls } = setup();
      setWallColor(plan, walls[0], 'front', '#111111');
      setWallColor(plan, walls[0], 'front', null);
      expect('colors' in plan.walls[0]).toBe(false);
    });

    it('never mutates a colors object shared with another wall', () => {
      const { plan, walls } = setup();
      const shared = { front: '#111111' };
      plan.walls[0].colors = shared;
      plan.walls[1].colors = shared;
      setWallColor(plan, walls[0], 'front', '#999999');
      expect(plan.walls[1].colors).toEqual({ front: '#111111' });
    });
  });

  describe('updateOpening', () => {
    it('keeps the opening on its wall', () => {
      const { plan } = setup();
      updateOpening(plan, 'o1', { offset: 395 });
      expect(plan.openings[0].offset).toBe(360);
      updateOpening(plan, 'o1', { width: 900 });
      expect(plan.openings[0]).toMatchObject({ width: 400, offset: 200 });
    });

    it('changes swing and flip', () => {
      const { plan } = setup();
      updateOpening(plan, 'o1', { swing: 'right', flip: true });
      expect(plan.openings[0]).toMatchObject({ swing: 'right', flip: true });
    });
  });

  describe('furniture', () => {
    it('normalizes rotation and clears blank labels', () => {
      const { plan } = setup();
      updateFurniture(plan, 'f1', { rotation: 450, label: 'Couch' });
      expect(plan.furniture[0]).toMatchObject({ rotation: 90, label: 'Couch' });
      updateFurniture(plan, 'f1', { label: '  ' });
      expect('label' in plan.furniture[0]).toBe(false);
    });

    it('resets to catalog size', () => {
      const { plan } = setup();
      updateFurniture(plan, 'f1', { width: 1, depth: 2, height: 3 });
      resetFurnitureSize(plan, 'f1');
      const c = catalogItem('sofa-3');
      expect(plan.furniture[0]).toMatchObject({ width: c.width, depth: c.depth, height: c.height });
    });
  });

  describe('upsertRoomMeta', () => {
    it('creates metadata on first edit, then updates it in place', () => {
      const { plan } = setup();
      const room = () => attachRoomMeta(detectRooms(plan), plan.rooms)[0];
      upsertRoomMeta(plan, room(), { name: 'Den' });
      expect(plan.rooms).toHaveLength(1);
      expect(room().name).toBe('Den');
      upsertRoomMeta(plan, room(), { floorColor: '#123456' });
      expect(plan.rooms).toHaveLength(1);
      expect(room()).toMatchObject({ name: 'Den', floorColor: '#123456' });
    });

    it('re-anchors metadata at the room label so it survives walls moving', () => {
      const { plan } = setup();
      const r = attachRoomMeta(detectRooms(plan), plan.rooms)[0];
      upsertRoomMeta(plan, r, { name: 'Den' });
      expect(plan.rooms[0].anchor).toEqual(r.label);
      expect(wallSegments(plan)).toHaveLength(4);
    });
  });

  it("sets and clears an item's uploaded model", () => {
    const { plan } = setup();
    setFurnitureModel(plan, 'f1', 'm_1');
    expect(plan.furniture[0].modelId).toBe('m_1');
    setFurnitureModel(plan, 'f1', undefined);
    expect('modelId' in plan.furniture[0]).toBe(false);
  });

  it('remaps model ids and leaves other items alone', () => {
    const { plan } = setup();
    plan.furniture[0].modelId = 'old';
    plan.furniture.push({ ...createFurniture('desk', { x: 0, y: 0 }), id: 'f2', modelId: 'keep' });
    plan.furniture.push({ ...createFurniture('desk', { x: 0, y: 0 }), id: 'f3' });
    remapFurnitureModels(plan, new Map([['old', 'new']]));
    expect(plan.furniture.map((f) => f.modelId)).toEqual(['new', 'keep', undefined]);
  });
});
