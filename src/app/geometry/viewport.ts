/** Pure math for the 2D view: converting between screen pixels and plan centimeters, zooming and fitting. */
import { Point } from '../model/plan.model';

export interface Viewport {
  /** Screen-space translation in px. */
  x: number;
  y: number;
  /** Screen px per cm. */
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 12;
/** Screen padding kept around the plan when fitting it to the canvas. */
export const FIT_PADDING_PX = 64;
/** World size (cm) shown when fitting an empty plan: about 30 ft / 9 m. */
export const EMPTY_PLAN_SPAN = 900;

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export function screenToWorld(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom };
}

export function worldToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y };
}

/** Zooms by `factor`, keeping the world point under the screen point `anchor` in place. */
export function zoomAt(v: Viewport, anchor: Point, factor: number): Viewport {
  const zoom = clampZoom(v.zoom * factor);
  const world = screenToWorld(v, anchor);
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom };
}

/** World point at the middle of the canvas. */
export function viewCenter(v: Viewport, size: Size): Point {
  return screenToWorld(v, { x: size.width / 2, y: size.height / 2 });
}

/**
 * Viewport that shows all `points` centered with padding. With no points, shows an
 * EMPTY_PLAN_SPAN square around the origin's quadrant so new drawings start on screen.
 */
export function fitViewport(points: Point[], size: Size, padding = FIT_PADDING_PX): Viewport {
  const { width, height } = size;
  if (!points.length) {
    const zoom = Math.min(width, height) / EMPTY_PLAN_SPAN;
    return { zoom, x: width / 2 - (EMPTY_PLAN_SPAN / 2) * zoom, y: height / 2 - (EMPTY_PLAN_SPAN / 2) * zoom };
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 100;
  const h = Math.max(...ys) - minY || 100;
  const zoom = clampZoom(Math.min((width - padding * 2) / w, (height - padding * 2) / h));
  return { zoom, x: width / 2 - (minX + w / 2) * zoom, y: height / 2 - (minY + h / 2) * zoom };
}
