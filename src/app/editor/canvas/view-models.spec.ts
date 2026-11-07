import { attachRoomMeta, detectRooms } from '../../geometry/room-detection';
import { wallSegments } from '../../geometry/wall-geometry';
import { createEmptyPlan, createFurniture } from '../../model/defaults';
import { Opening } from '../../model/plan.model';
import { squareRoom } from '../../testing/fixtures';
import {
  accentViews,
  dimensionViews,
  furnitureViews,
  gridPaths,
  handleView,
  openingViews,
  overlayView,
  roomViews,
  wallViews,
} from './view-models';

function room() {
  const plan = createEmptyPlan();
  const walls = squareRoom(plan, 400, 300);
  const segments = wallSegments(plan);
  const rooms = attachRoomMeta(detectRooms(plan), []);
  return { plan, walls, segments, segmentById: new Map(segments.map((s) => [s.wall.id, s])), rooms };
}

describe('canvas view models', () => {
  describe('gridPaths', () => {
    it('draws minor lines only when they are far enough apart on screen', () => {
      const size = { width: 400, height: 300 };
      expect(gridPaths({ x: 0, y: 0, zoom: 1 }, size, 'metric').minor).not.toBe('');
      // 10 cm metric grid at 0.5 px/cm is 5 px apart: too dense.
      expect(gridPaths({ x: 0, y: 0, zoom: 0.5 }, size, 'metric').minor).toBe('');
    });

    it('spreads major lines out when zoomed far out', () => {
      const g = gridPaths({ x: 0, y: 0, zoom: 0.05 }, { width: 400, height: 300 }, 'metric');
      // 1 m lines would be 5 px apart, so they step up to 10 m (50 px).
      expect(g.major).toContain('M1000 ');
      expect(g.major).not.toContain('M100 ');
    });
  });

  it('builds room polygons with selection and formatted area', () => {
    const { rooms } = room();
    const [r] = roomViews(rooms, new Set([`room:${rooms[0].key}`]), 'metric');
    expect(r.selected).toBe(true);
    expect(r.area).toBe('12 m²');
    expect(r.points.split(' ')).toHaveLength(4);
  });

  it('marks selected and hovered walls', () => {
    const { segments, walls } = room();
    const views = wallViews(segments, new Set([`wall:${walls[0]}`]), { kind: 'wall', id: walls[1] });
    expect(views.find((w) => w.id === walls[0])).toMatchObject({ selected: true, hovered: false });
    expect(views.find((w) => w.id === walls[1])).toMatchObject({ selected: false, hovered: true });
  });

  it('puts accent stripes inside the wall on the painted side', () => {
    const { segments } = room();
    const top = segments[0];
    top.wall.colors = { back: '#2f4a6d' };
    const [a] = accentViews(segments, 1);
    expect(a.key).toBe(`${top.wall.id}:back`);
    // Top wall runs +x, so its normal points +y and the back face is toward -y.
    expect(a.y1).toBeLessThan(0);
    expect(a.y1).toBeGreaterThan(-top.wall.thickness / 2);
  });

  describe('openingViews', () => {
    const door = (o: Partial<Opening>): Opening => ({ id: 'd', wallId: '', kind: 'door', offset: 200, width: 80, height: 200, sillHeight: 0, ...o });

    it('hinges on the chosen side and swings toward the chosen face', () => {
      const { walls, segmentById } = room();
      const [left] = openingViews([door({ wallId: walls[0], swing: 'left' })], segmentById, new Set(), 1);
      const [right] = openingViews([door({ wallId: walls[0], swing: 'right' })], segmentById, new Set(), 1);
      const [flipped] = openingViews([door({ wallId: walls[0], flip: true })], segmentById, new Set(), 1);
      expect(left.leaf.startsWith('M-40 ')).toBe(true);
      expect(right.leaf.startsWith('M40 ')).toBe(true);
      // Unflipped doors open toward +y (the wall normal), flipped ones toward -y.
      expect(left.leaf).toMatch(/L-40 85$/);
      expect(flipped.leaf).toMatch(/L-40 -85$/);
      // The arc sweep direction flips with the swing side.
      expect(left.arc.split(' ')[5]).not.toBe(right.arc.split(' ')[5]);
    });

    it('skips openings whose wall is gone', () => {
      expect(openingViews([door({ wallId: 'missing' })], new Map(), new Set(), 1)).toEqual([]);
    });
  });

  it('gives patterned floors their pattern and plain floors none', () => {
    const { rooms } = room();
    expect(roomViews(rooms, new Set(), 'metric')[0].pattern).toBeNull();
    expect(roomViews([{ ...rooms[0], floorMaterial: 'wood' }], new Set(), 'metric')[0].pattern).toBe('wood');
  });

  it('draws rugs first and hides labels that would not fit', () => {
    const sofa = { ...createFurniture('sofa-3', { x: 0, y: 0 }), id: 'sofa' };
    const rug = { ...createFurniture('rug-large', { x: 0, y: 0 }), id: 'rug' };
    const views = furnitureViews([sofa, rug], new Set(['sofa']), new Set(), 1);
    expect(views.map((v) => [v.id, v.layer])).toEqual([
      ['rug', 'floor'],
      ['sofa', 'top'],
    ]);
    expect(views[1].overlap).toBe(true);
    expect(views[1].showLabel).toBe(true);
    expect(furnitureViews([sofa], new Set(), new Set(), 0.05)[0].showLabel).toBe(false);
  });

  it('draws selected items last, lifting a selected rug above the furniture on it', () => {
    const sofa = { ...createFurniture('sofa-3', { x: 0, y: 0 }), id: 'sofa' };
    const rug = { ...createFurniture('rug-large', { x: 0, y: 0 }), id: 'rug' };
    const lamp = { ...createFurniture('table-lamp', { x: 0, y: 0 }), id: 'lamp', elevation: 80 };
    const elevationOf = (f: { elevation?: number }) => f.elevation ?? 0;
    const pick = (ids: string[]) =>
      furnitureViews([lamp, rug, sofa], new Set(), new Set(ids.map((id) => `furniture:${id}`)), 1, elevationOf).map((v) => [v.id, v.layer]);
    expect(pick(['sofa'])).toEqual([
      ['rug', 'floor'],
      ['lamp', 'top'],
      ['sofa', 'top'],
    ]);
    expect(pick(['rug'])).toEqual([
      ['sofa', 'top'],
      ['lamp', 'top'],
      ['rug', 'top'],
    ]);
  });

  it('draws higher items over lower ones and marks ceiling items', () => {
    const lamp = { ...createFurniture('table-lamp', { x: 0, y: 0 }), id: 'lamp', elevation: 80 };
    const dresser = { ...createFurniture('dresser', { x: 0, y: 0 }), id: 'dresser' };
    const pendant = { ...createFurniture('pendant', { x: 0, y: 0 }), id: 'pendant' };
    const elevationOf = (f: { id: string; elevation?: number }) => (f.id === 'pendant' ? 200 : (f.elevation ?? 0));
    const views = furnitureViews([pendant, lamp, dresser], new Set(), new Set(), 1, elevationOf);
    expect(views.map((v) => v.id)).toEqual(['dresser', 'lamp', 'pendant']);
    expect(views.map((v) => v.mount)).toEqual(['floor', 'floor', 'ceiling']);
  });

  describe('dimensionViews', () => {
    it('labels each wall on the outside of the room, upright', () => {
      const { segments, rooms } = room();
      const dims = dimensionViews(segments, rooms, 'metric', 1);
      expect(dims).toHaveLength(4);
      const top = dims.find((d) => d.id === segments[0].wall.id)!;
      expect(top.y).toBeLessThan(0);
      expect(top.text).toBe('4.00 m');
      for (const d of dims) expect(d.angle > -90 && d.angle <= 90).toBe(true);
    });

    it('drops labels for walls too short on screen', () => {
      const { segments, rooms } = room();
      expect(dimensionViews(segments, rooms, 'metric', 0.1)).toEqual([]);
    });
  });

  it('places handles relative to the item and scales them with zoom', () => {
    const f = { ...createFurniture('box', { x: 10, y: 20 }, 30), width: 100, depth: 50 };
    const h = handleView(f, 'metric', 0.5);
    expect(h.transform).toBe('translate(10 20) rotate(30)');
    expect(h.size).toBe(4);
    expect(h.rotateY).toBe(-25 - 13);
    expect(h.text).toBe('1.00 m × 50 cm');
  });

  describe('overlayView', () => {
    it('shows the live wall segment with its length and the crosshair only for the wall tool', () => {
      const o = { wallChain: [{ x: 0, y: 0 }], wallCursor: { x: 300, y: 0 } };
      const view = overlayView(o, new Map(), 'metric', 1, 'wall');
      expect(view.live?.label).toBe('3.00 m');
      expect(view.cursor).toEqual({ x: 300, y: 0 });
      expect(view.chain).toBe('');
      expect(overlayView(o, new Map(), 'metric', 1, 'select').cursor).toBeNull();
    });

    it('normalizes the selection box and labels measured distances', () => {
      const view = overlayView(
        { box: { a: { x: 50, y: 40 }, b: { x: 10, y: 0 } }, measures: [{ from: { x: 0, y: 0 }, to: { x: 0, y: 120 } }] },
        new Map(),
        'metric',
        1,
        'select',
      );
      expect(view.box).toEqual({ x: 10, y: 0, w: 40, h: 40 });
      expect(view.measures[0]).toMatchObject({ text: '1.20 m', mx: 0, my: 60 });
    });
  });
});
