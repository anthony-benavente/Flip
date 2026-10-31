import { attachRoomMeta, detectRooms } from '../../geometry/room-detection';
import { wallSegments } from '../../geometry/wall-geometry';
import { BASEBOARD } from '../../geometry/wall-pieces';
import { catalogItem, EYE_LEVEL } from '../../model/catalog';
import { createEmptyPlan, createFurniture } from '../../model/defaults';
import { FurnitureItem, Plan } from '../../model/plan.model';
import { squareRoom } from '../../testing/fixtures';
import { elevationView, ElevationInput, faceFrame } from './elevation-view-models';

/** A 400 × 300 room; the top wall runs from (0, 0) to (400, 0) and its front faces down into the room. */
function setup(edit?: (plan: Plan, walls: string[]) => void) {
  const plan = createEmptyPlan();
  const walls = squareRoom(plan, 400, 300);
  plan.rooms.push({ id: 'r', anchor: { x: 200, y: 150 }, name: 'Den', floorColor: '#111111', wallColor: '#223344', trimColor: '#eeeeee' });
  edit?.(plan, walls);
  const segments = wallSegments(plan);
  const rooms = attachRoomMeta(detectRooms(plan), plan.rooms);
  const top = segments.find((s) => s.wall.id === walls[0])!;
  const input = (patch: Partial<ElevationInput> = {}): ElevationInput => ({
    seg: top,
    side: 'front',
    segments,
    furniture: plan.furniture,
    openings: plan.openings,
    rooms,
    selected: new Set(),
    units: 'metric',
    ...patch,
  });
  return { plan, walls, top, input };
}

/** Art hung on the top wall's room face, centered `along` from its left end. */
function hungArt(along: number, elevation = 120): FurnitureItem {
  const art = { ...createFurniture('art-small', { x: along, y: 0 }), id: `art-${along}`, elevation };
  art.y = 5 + art.depth / 2;
  return art;
}

describe('faceFrame', () => {
  it('runs left to right as seen from the room, so the view is not mirrored', () => {
    const { top } = setup();
    // Standing in the room below the top wall, looking up the screen: left is x = 0.
    const front = faceFrame(top, 'front');
    expect(front.toX(100)).toBe(100);
    expect(front.outward.y).toBeGreaterThan(0);
    // From outside, above the wall looking down the screen: left is the far end, x = 400.
    const back = faceFrame(top, 'back');
    expect(back.toX(100)).toBe(300);
    expect(back.toAlong(back.toX(37))).toBe(37);
    expect(back.outward.y).toBeLessThan(0);
  });
});

describe('elevationView', () => {
  it('draws the face in its paint with the room trim and ceiling', () => {
    const { input } = setup();
    const v = elevationView(input());
    expect(v).toMatchObject({ width: 400, height: 240, title: 'Den wall', wallColor: '#223344', trimColor: '#eeeeee' });
    expect(v.trim).toHaveLength(1);
    expect(v.trim[0]).toMatchObject({ x: 0, w: 400, y: -BASEBOARD.height, h: BASEBOARD.height });
    expect(v.guides.map((g) => g.kind)).toEqual(['floor', 'ceiling', 'eye']);
    expect(v.guides.find((g) => g.kind === 'eye')!.y).toBeCloseTo(-EYE_LEVEL);
  });

  it('shows no trim on the outside face', () => {
    const { input } = setup();
    const v = elevationView(input({ side: 'back' }));
    expect(v.title).toBe('Outside wall');
    expect(v.trim).toEqual([]);
  });

  it('places openings and hung items, mirrored on the far side', () => {
    const { input } = setup((p, w) => {
      p.openings.push({ id: 'win', wallId: w[0], kind: 'window', offset: 300, width: 80, height: 100, sillHeight: 90 });
      p.furniture.push(hungArt(100));
    });
    const front = elevationView(input({ selected: new Set(['furniture:art-100']) }));
    expect(front.openings).toEqual([{ kind: 'window', x: 260, w: 80, y: -190, h: 100 }]);
    const art = front.items[0];
    expect(art.x + art.w / 2).toBeCloseTo(100);
    expect(art.y).toBeCloseTo(-(120 + art.h));
    expect(art.selected).toBe(true);
    expect(art.heightLabel).toContain('center');
    // The back face is not where the art hangs, and its window sits at the other end.
    const back = elevationView(input({ side: 'back' }));
    expect(back.items).toEqual([]);
    expect(back.openings[0].x).toBe(60);
  });

  it('shows nearby furniture as silhouettes with height guides and an art band', () => {
    const { input } = setup((p) => {
      const sofa = { ...createFurniture('sofa-3', { x: 200, y: 0 }), id: 'sofa' };
      sofa.y = 5 + sofa.depth / 2;
      p.furniture.push(sofa, { ...createFurniture('bed-queen', { x: 200, y: 250 }), id: 'far' });
    });
    const v = elevationView(input());
    expect(v.silhouettes.map((s) => s.id)).toEqual(['sofa']);
    const sofa = v.silhouettes[0];
    expect(sofa.w).toBeCloseTo(catalogItem('sofa-3').width);
    expect(v.guides.some((g) => g.kind === 'top' && Math.abs(g.y - sofa.y) < 1e-6)).toBe(true);
    expect(v.artBands).toHaveLength(1);
    expect(v.artBands[0].y + v.artBands[0].h).toBeCloseTo(sofa.y - 15);
  });

  it('uses the uploaded picture when it has loaded', () => {
    const { input } = setup((p) => p.furniture.push({ ...hungArt(100), artImageId: 'i_1' }));
    expect(elevationView(input()).items[0].image).toBeNull();
    expect(elevationView(input({ imageUrl: () => 'blob:pic' })).items[0].image).toBe('blob:pic');
  });
});
