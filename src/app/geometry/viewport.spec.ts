import { clampZoom, EMPTY_PLAN_SPAN, fitViewport, MAX_ZOOM, MIN_ZOOM, screenToWorld, viewCenter, worldToScreen, zoomAt } from './viewport';

describe('viewport math', () => {
  const v = { x: 40, y: -20, zoom: 2 };

  it('converts screen and world points both ways', () => {
    const world = screenToWorld(v, { x: 140, y: 80 });
    expect(world).toEqual({ x: 50, y: 50 });
    expect(worldToScreen(v, world)).toEqual({ x: 140, y: 80 });
  });

  it('keeps the world point under the cursor fixed while zooming', () => {
    const anchor = { x: 300, y: 200 };
    const before = screenToWorld(v, anchor);
    const zoomed = zoomAt(v, anchor, 1.7);
    expect(zoomed.zoom).toBeCloseTo(3.4);
    const after = screenToWorld(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom to the allowed range', () => {
    expect(zoomAt(v, { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(v, { x: 0, y: 0 }, 0.0001).zoom).toBe(MIN_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  it('finds the world point at the canvas center', () => {
    expect(viewCenter({ x: 0, y: 0, zoom: 1 }, { width: 800, height: 600 })).toEqual({ x: 400, y: 300 });
  });

  describe('fitViewport', () => {
    const size = { width: 800, height: 600 };

    it('centers the points and keeps padding on the tighter axis', () => {
      const fit = fitViewport([{ x: 0, y: 0 }, { x: 400, y: 200 }], size, 50);
      const c = worldToScreen(fit, { x: 200, y: 100 });
      expect(c.x).toBeCloseTo(400);
      expect(c.y).toBeCloseTo(300);
      // Width is the tighter axis: 400 cm must span 800 - 2 * 50 px.
      expect(fit.zoom).toBeCloseTo(700 / 400);
    });

    it('shows a fixed area for an empty plan', () => {
      const fit = fitViewport([], size);
      expect(fit.zoom).toBeCloseTo(600 / EMPTY_PLAN_SPAN);
      expect(worldToScreen(fit, { x: EMPTY_PLAN_SPAN / 2, y: EMPTY_PLAN_SPAN / 2 })).toEqual({ x: 400, y: 300 });
    });

    it('does not divide by zero for a single point', () => {
      const fit = fitViewport([{ x: 10, y: 10 }], size);
      expect(Number.isFinite(fit.zoom)).toBe(true);
      expect(fit.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    });
  });
});
