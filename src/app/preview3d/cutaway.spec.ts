import { isWallCut } from './cutaway';

describe('isWallCut', () => {
  const center = { x: 0, y: 0 };
  // A square room 4 m wide; camera looking from the +x/+y corner.
  const camera = { x: 6, y: 6 };
  const walls = {
    near: { mid: { x: 2, y: 0 }, normal: { x: -1, y: 0 } },
    nearToo: { mid: { x: 0, y: 2 }, normal: { x: 0, y: 1 } },
    far: { mid: { x: -2, y: 0 }, normal: { x: 1, y: 0 } },
    farToo: { mid: { x: 0, y: -2 }, normal: { x: 0, y: -1 } },
  };
  const cut = (w: { mid: { x: number; y: number }; normal: { x: number; y: number } }, height = 4, cam = camera) =>
    isWallCut(w.mid, w.normal, center, cam, height, 4);

  it('cuts the walls between the camera and the room, regardless of which way their normal points', () => {
    expect(cut(walls.near)).toBe(true);
    expect(cut(walls.nearToo)).toBe(true);
  });

  it('keeps the walls at the back of the room', () => {
    expect(cut(walls.far)).toBe(false);
    expect(cut(walls.farToo)).toBe(false);
  });

  it('cuts nothing when looking almost straight down', () => {
    expect(cut(walls.near, 50)).toBe(false);
    expect(cut(walls.near, 4, { x: 0, y: 0 })).toBe(false);
  });

  it('keeps walls seen edge-on', () => {
    expect(isWallCut({ x: 2, y: 0 }, { x: 0, y: 1 }, center, { x: 8, y: 0 }, 3, 4)).toBe(false);
  });
});
