import { createEmptyPlan } from '../model/defaults';
import { snapPoint } from './snapping';
import { addWall } from './wall-geometry';

const props = { thickness: 10, height: 240 };

function plan() {
  const p = createEmptyPlan();
  addWall(p, { x: 0, y: 0 }, { x: 400, y: 0 }, props);
  return p;
}

describe('snapPoint', () => {
  const base = { tolerance: 10, grid: 10 };

  it('prefers existing corners', () => {
    const r = snapPoint({ x: 396, y: 4 }, plan(), base);
    expect(r.kind).toBe('node');
    expect(r.point).toEqual({ x: 400, y: 0 });
  });

  it('snaps onto walls', () => {
    const r = snapPoint({ x: 203, y: 6 }, plan(), base);
    expect(r.kind).toBe('wall');
    expect(r.point.y).toBeCloseTo(0);
    expect(r.point.x).toBeCloseTo(203);
  });

  it('locks to 15 degree steps from the previous point', () => {
    const r = snapPoint({ x: 102, y: 303 }, plan(), { ...base, from: { x: 100, y: 100 } });
    expect(r.kind).toBe('angle');
    expect(r.point.x).toBeCloseTo(100);
    expect(r.point.y).toBeCloseTo(300);
  });

  it('forces right angles with the orthogonal option', () => {
    const r = snapPoint({ x: 160, y: 330 }, plan(), { ...base, from: { x: 100, y: 100 }, orthogonal: true });
    expect(r.point.x).toBeCloseTo(100);
    expect(r.point.y).toBeCloseTo(330);
  });

  it('aligns with existing corners on an axis', () => {
    const r = snapPoint({ x: 404, y: 253 }, plan(), base);
    expect(r.kind).toBe('align');
    expect(r.point).toEqual({ x: 400, y: 250 });
    expect(r.guides).toHaveLength(1);
  });

  it('falls back to the grid', () => {
    const r = snapPoint({ x: 1234, y: 987 }, plan(), base);
    expect(r.kind).toBe('grid');
    expect(r.point).toEqual({ x: 1230, y: 990 });
  });

  it('does nothing when disabled', () => {
    const r = snapPoint({ x: 396, y: 4 }, plan(), { ...base, disabled: true });
    expect(r.kind).toBe('none');
    expect(r.point).toEqual({ x: 396, y: 4 });
  });
});
