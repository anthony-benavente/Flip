import { FloorMaterial } from '../model/plan.model';
import { floorPattern } from './floor-textures';

const value = (p: { size: number; data: Uint8Array }, x: number, y: number) => p.data[(y * p.size + x) * 4];

describe('floorPattern', () => {
  it('has no pattern for a plain floor', () => {
    expect(floorPattern('solid')).toBeNull();
  });

  it.each<FloorMaterial>(['wood', 'tile', 'carpet', 'concrete'])('makes an opaque, mostly light %s pattern', (material) => {
    const p = floorPattern(material)!;
    expect(p.data.length).toBe(p.size * p.size * 4);
    expect(p.meters).toBeGreaterThan(0);
    let sum = 0;
    for (let i = 0; i < p.data.length; i += 4) {
      expect(p.data[i]).toBe(p.data[i + 1]);
      expect(p.data[i + 3]).toBe(255);
      sum += p.data[i];
    }
    // Light enough that the room's floor color still reads.
    expect(sum / (p.size * p.size)).toBeGreaterThan(200);
  });

  it('wraps smoothly where copies meet', () => {
    const p = floorPattern('concrete')!;
    for (let i = 0; i < p.size; i += 16) {
      expect(Math.abs(value(p, 0, i) - value(p, p.size - 1, i))).toBeLessThan(12);
      expect(Math.abs(value(p, i, 0) - value(p, i, p.size - 1))).toBeLessThan(12);
    }
  });

  it('is the same on every build', () => {
    expect(floorPattern('wood')!.data).toEqual(floorPattern('wood')!.data);
  });
});
