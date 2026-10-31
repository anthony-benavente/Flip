import { Point } from '../model/plan.model';

export const EPS = 1e-6;

export const vec = (x: number, y: number): Point => ({ x, y });
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
export const len = (a: Point): number => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function normalize(a: Point): Point {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Left-hand perpendicular in a y-down screen space (rotates +90° visually clockwise). */
export const perp = (a: Point): Point => ({ x: -a.y, y: a.x });

export function rotate(p: Point, deg: number, origin: Point = { x: 0, y: 0 }): Point {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

export const angleDeg = (a: Point): number => (Math.atan2(a.y, a.x) * 180) / Math.PI;

/** Projects p onto segment ab. Returns the parameter t (clamped to 0..1) and the closest point. */
export function projectToSegment(p: Point, a: Point, b: Point): { t: number; point: Point; distance: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 < EPS ? 0 : dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = lerp(a, b, t);
  return { t, point, distance: dist(p, point) };
}

/** Signed polygon area. Positive for clockwise order in y-down space. */
export function polygonArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polygonCentroid(poly: Point[]): Point {
  const area = polygonArea(poly);
  if (Math.abs(area) < EPS) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Distance from p to the polygon boundary. */
export function distanceToPolygonEdge(p: Point, poly: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, projectToSegment(p, poly[i], poly[(i + 1) % poly.length]).distance);
  }
  return best;
}

/**
 * Pole of inaccessibility approximation: a point well inside the polygon,
 * used to place room labels in L-shaped and other concave rooms.
 */
export function labelPoint(poly: Point[]): Point {
  const c = polygonCentroid(poly);
  if (pointInPolygon(c, poly) && distanceToPolygonEdge(c, poly) > 20) return c;
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const steps = 24;
  let best = c;
  let bestD = pointInPolygon(c, poly) ? distanceToPolygonEdge(c, poly) : -1;
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const q = { x: minX + ((maxX - minX) * i) / steps, y: minY + ((maxY - minY) * j) / steps };
      if (!pointInPolygon(q, poly)) continue;
      const d = distanceToPolygonEdge(q, poly);
      if (d > bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  return best;
}

/** Corners of a rotated rectangle centered at c. */
export function rectCorners(c: Point, width: number, depth: number, rotation: number): Point[] {
  const hw = width / 2;
  const hd = depth / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => add(rotate(p, rotation), c));
}

/** Separating axis test for two convex polygons. */
export function convexOverlap(a: Point[], b: Point[], tolerance = 0.5): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const edge = sub(poly[(i + 1) % poly.length], poly[i]);
      const axis = normalize(perp(edge));
      const pa = a.map((p) => dot(p, axis));
      const pb = b.map((p) => dot(p, axis));
      if (Math.max(...pa) - tolerance <= Math.min(...pb) || Math.max(...pb) - tolerance <= Math.min(...pa)) {
        return false;
      }
    }
  }
  return true;
}
