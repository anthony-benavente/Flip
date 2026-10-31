import { shade } from '../shared/color';
import { CATALOG, CATALOG_CATEGORIES, catalogItem } from './catalog';
import { symbolParts } from './furniture-symbols';

describe('furniture catalog', () => {
  it('has unique ids and sensible dimensions and colors', () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
    for (const c of CATALOG) {
      expect(c.width, c.id).toBeGreaterThan(0);
      expect(c.depth, c.id).toBeGreaterThan(0);
      expect(c.height, c.id).toBeGreaterThan(0);
      expect(c.color, c.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(CATALOG_CATEGORIES, c.id).toContain(c.category);
    }
  });

  it('has items in every category', () => {
    for (const cat of CATALOG_CATEGORIES) expect(CATALOG.some((c) => c.category === cat), cat).toBe(true);
  });

  it('falls back to a generic item for unknown ids', () => {
    expect(catalogItem('sofa-3').name).toBe('Sofa');
    expect(catalogItem('does-not-exist').id).toBe('box');
  });

  it.each(CATALOG.map((c) => [c.id, c] as const))('draws the %s symbol inside its footprint', (_id, c) => {
    const hw = c.width / 2 + 0.01;
    const hd = c.depth / 2 + 0.01;
    for (const p of symbolParts(c.shape, c.width, c.depth)) {
      if (p.t === 'rect') {
        expect(p.x).toBeGreaterThanOrEqual(-hw);
        expect(p.x + p.w).toBeLessThanOrEqual(hw);
        expect(p.y).toBeGreaterThanOrEqual(-hd);
        expect(p.y + p.h).toBeLessThanOrEqual(hd);
        expect(p.w).toBeGreaterThan(0);
        expect(p.h).toBeGreaterThan(0);
      } else if (p.t === 'circle') {
        expect(p.cx - p.r).toBeGreaterThanOrEqual(-hw);
        expect(p.cx + p.r).toBeLessThanOrEqual(hw);
        expect(p.cy - p.r).toBeGreaterThanOrEqual(-hd);
        expect(p.cy + p.r).toBeLessThanOrEqual(hd);
      } else {
        for (const [x, y] of [
          [p.x1, p.y1],
          [p.x2, p.y2],
        ]) {
          expect(Math.abs(x)).toBeLessThanOrEqual(hw);
          expect(Math.abs(y)).toBeLessThanOrEqual(hd);
        }
      }
    }
  });
});

describe('shade', () => {
  it('lightens toward white and darkens toward black', () => {
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#808080', 0)).toBe('#808080');
    expect(shade('#000000', 0.5)).toBe('#808080');
  });

  it('returns unrecognized colors unchanged', () => {
    expect(shade('red', 0.3)).toBe('red');
    expect(shade('#fff', 0.3)).toBe('#fff');
  });
});
