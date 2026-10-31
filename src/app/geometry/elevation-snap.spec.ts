import { FaceSnapTargets, snapOnFace } from './elevation-snap';

const targets = (patch: Partial<FaceSnapTargets> = {}): FaceSnapTargets => ({
  centerLevels: [145],
  levels: [],
  centers: [],
  edges: [],
  grid: 10,
  tolerance: 6,
  ...patch,
});

describe('snapOnFace', () => {
  it('centers art at eye level and over the furniture below', () => {
    const snap = snapOnFace({ x: 77, w: 50, bottom: 117, h: 60 }, targets({ centers: [100] }));
    expect(snap.x).toBe(75);
    expect(snap.bottom).toBe(115);
    expect(snap.guides).toEqual([{ x: 100 }, { height: 145 }]);
  });

  it('lines edges up with other items and rests on levels', () => {
    const snap = snapOnFace({ x: 203, w: 40, bottom: 89, h: 5 }, targets({ edges: [200, 260], levels: [90], centerLevels: [] }));
    expect(snap.x).toBe(200);
    expect(snap.bottom).toBe(90);
  });

  it('falls back to the grid when nothing is close', () => {
    const snap = snapOnFace({ x: 33, w: 40, bottom: 52, h: 30 }, targets({ centerLevels: [] }));
    expect(snap.x + 20).toBe(50);
    expect(snap.bottom).toBe(50);
    expect(snap.guides).toEqual([]);
  });
});
