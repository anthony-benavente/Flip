import {
  convexOverlap,
  labelPoint,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  projectToSegment,
  rectCorners,
  rotate,
} from './vec';

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('projectToSegment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it('projects onto the interior', () => {
    const r = projectToSegment({ x: 40, y: 30 }, a, b);
    expect(r.t).toBeCloseTo(0.4);
    expect(r.point).toEqual({ x: 40, y: 0 });
    expect(r.distance).toBeCloseTo(30);
  });

  it('clamps beyond either end', () => {
    expect(projectToSegment({ x: -50, y: 0 }, a, b).point).toEqual(a);
    expect(projectToSegment({ x: 150, y: 10 }, a, b).point).toEqual(b);
  });

  it('handles a zero-length segment', () => {
    const r = projectToSegment({ x: 3, y: 4 }, a, a);
    expect(r.t).toBe(0);
    expect(r.distance).toBeCloseTo(5);
  });
});

describe('polygons', () => {
  it('computes signed area and centroid', () => {
    expect(polygonArea(square)).toBeCloseTo(10000);
    expect(polygonArea([...square].reverse())).toBeCloseTo(-10000);
    const c = polygonCentroid(square);
    expect(c.x).toBeCloseTo(50);
    expect(c.y).toBeCloseTo(50);
  });

  it('tests containment in a concave polygon', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 300 },
      { x: 0, y: 300 },
    ];
    expect(pointInPolygon({ x: 50, y: 250 }, l)).toBe(true);
    expect(pointInPolygon({ x: 250, y: 50 }, l)).toBe(true);
    expect(pointInPolygon({ x: 200, y: 200 }, l)).toBe(false);
    // The centroid of this L falls in the notch-adjacent area; the label point must be inside.
    expect(pointInPolygon(labelPoint(l), l)).toBe(true);
  });
});

describe('rotation and rectangles', () => {
  it('rotates clockwise on screen for positive degrees (y down)', () => {
    const p = rotate({ x: 1, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it('builds rotated rectangle corners', () => {
    const c = rectCorners({ x: 0, y: 0 }, 200, 100, 90);
    const xs = c.map((p) => p.x);
    const ys = c.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(200);
  });
});

describe('convexOverlap', () => {
  it('detects overlap and ignores edges that only touch', () => {
    const a = rectCorners({ x: 0, y: 0 }, 100, 100, 0);
    expect(convexOverlap(a, rectCorners({ x: 50, y: 50 }, 100, 100, 0))).toBe(true);
    expect(convexOverlap(a, rectCorners({ x: 100, y: 0 }, 100, 100, 0))).toBe(false);
    expect(convexOverlap(a, rectCorners({ x: 300, y: 0 }, 100, 100, 0))).toBe(false);
  });

  it('uses the rotated shape, not its bounding box', () => {
    const a = rectCorners({ x: 0, y: 0 }, 100, 100, 0);
    // A diamond whose bounding box overlaps the square's corner but whose body does not.
    const diamond = rectCorners({ x: 105, y: 105 }, 100, 100, 45);
    expect(convexOverlap(a, diamond)).toBe(false);
    expect(convexOverlap(a, rectCorners({ x: 80, y: 80 }, 100, 100, 45))).toBe(true);
  });
});
