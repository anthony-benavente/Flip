/**
 * Pure builders that turn plan and editor state into template-ready data for the SVG canvas.
 * They take plain values (no stores) so they can be unit-tested and memoized with `computed`.
 */
import { Room } from '../../geometry/room-detection';
import { formatArea, formatLength, gridSize, majorGridSize } from '../../geometry/units';
import { add, angleDeg, dist, pointInPolygon, scale } from '../../geometry/vec';
import { Size, Viewport } from '../../geometry/viewport';
import { WallSegment } from '../../geometry/wall-geometry';
import { catalogItem } from '../../model/catalog';
import { DisplayUnits, FurnitureItem, Opening } from '../../model/plan.model';
import { SelectionItem, ToolId, ToolOverlay } from '../../state/editor.store';

/** Selected ids as `kind:id` strings, as produced by `EditorStore.selectedIds`. */
export type SelectedIds = ReadonlySet<string>;

/** Grid lines closer than this many screen pixels are not drawn. */
export const MIN_GRID_SPACING_PX = 6;
/** Major grid lines are spread out until at least this far apart on screen. */
export const MIN_MAJOR_SPACING_PX = 12;
/** Walls shorter than this on screen get no dimension label. */
export const MIN_DIMENSION_PX = 48;

const transformOf = (x: number, y: number, rotation: number) => `translate(${x} ${y}) rotate(${rotation})`;

export function gridPaths(v: Viewport, size: Size, units: DisplayUnits): { minor: string; major: string } {
  const x0 = -v.x / v.zoom;
  const y0 = -v.y / v.zoom;
  const x1 = (size.width - v.x) / v.zoom;
  const y1 = (size.height - v.y) / v.zoom;
  const lines = (step: number) => {
    if (step * v.zoom < MIN_GRID_SPACING_PX) return '';
    let d = '';
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) d += `M${x} ${y0}V${y1}`;
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) d += `M${x0} ${y}H${x1}`;
    return d;
  };
  let major = majorGridSize(units);
  while (major * v.zoom < MIN_MAJOR_SPACING_PX) major *= units === 'imperial' ? 5 : 10;
  return { minor: lines(gridSize(units)), major: lines(major) };
}

export function roomViews(rooms: Room[], selected: SelectedIds, units: DisplayUnits) {
  return rooms.map((r) => ({
    key: r.key,
    points: r.polygon.map((p) => `${p.x},${p.y}`).join(' '),
    fill: r.floorColor,
    selected: selected.has(`room:${r.key}`),
    label: r.label,
    name: r.name,
    area: formatArea(r.area, units),
  }));
}

export function wallViews(segments: WallSegment[], selected: SelectedIds, hover: SelectionItem | null) {
  return segments.map((s) => ({
    id: s.wall.id,
    x1: s.a.x,
    y1: s.a.y,
    x2: s.b.x,
    y2: s.b.y,
    t: s.wall.thickness,
    selected: selected.has(`wall:${s.wall.id}`),
    hovered: hover?.kind === 'wall' && hover.id === s.wall.id,
  }));
}

/** Accent wall faces, drawn as a colored band just inside that face of the wall. */
export function accentViews(segments: WallSegment[], px: number) {
  const result: { key: string; x1: number; y1: number; x2: number; y2: number; width: number; color: string }[] = [];
  for (const s of segments) {
    for (const side of ['front', 'back'] as const) {
      const color = s.wall.colors?.[side];
      if (!color) continue;
      const width = s.wall.thickness * 0.38;
      const off = scale(s.normal, (side === 'front' ? 1 : -1) * (s.wall.thickness / 2 - width / 2 - 1.5 * px));
      result.push({ key: `${s.wall.id}:${side}`, x1: s.a.x + off.x, y1: s.a.y + off.y, x2: s.b.x + off.x, y2: s.b.y + off.y, width, color });
    }
  }
  return result;
}

/** Doors (leaf + swing arc) and windows, in each opening's wall-aligned local frame. */
export function openingViews(openings: Opening[], segmentById: ReadonlyMap<string, WallSegment>, selected: SelectedIds, px: number) {
  const result = [];
  for (const o of openings) {
    const seg = segmentById.get(o.wallId);
    if (!seg) continue;
    const c = add(seg.a, scale(seg.dir, o.offset));
    const t = seg.wall.thickness;
    const w = o.width;
    const hingeX = o.swing === 'right' ? w / 2 : -w / 2;
    const otherX = -hingeX;
    const sgn = o.flip ? -1 : 1;
    const tipY = sgn * (t / 2 + w);
    // SVG sweep flag 1 = increasing angle; the arc turns from the open leaf back to the far jamb.
    const sweep = -sgn * w * (otherX - hingeX) > 0 ? 1 : 0;
    result.push({
      id: o.id,
      kind: o.kind,
      transform: transformOf(c.x, c.y, angleDeg(seg.dir)),
      w,
      t,
      gapH: t + 2 * px,
      leaf: `M${hingeX} ${(sgn * t) / 2}L${hingeX} ${tipY}`,
      arc: `M${hingeX} ${tipY}A${w} ${w} 0 0 ${sweep} ${otherX} ${(sgn * t) / 2}`,
      selected: selected.has(`opening:${o.id}`),
    });
  }
  return result;
}

/** Furniture, with floor-layer items (rugs) first so everything else draws on top. */
export function furnitureViews(furniture: FurnitureItem[], overlaps: ReadonlySet<string>, selected: SelectedIds, zoom: number) {
  const items = furniture.map((f) => {
    const c = catalogItem(f.catalogId);
    const label = f.label || c.name;
    return {
      id: f.id,
      transform: transformOf(f.x, f.y, f.rotation),
      shape: c.shape,
      w: f.width,
      d: f.depth,
      color: f.color,
      floor: !!c.floorLayer,
      label,
      showLabel: f.width * zoom > label.length * 6.5 + 8 && f.depth * zoom > 16,
      // Keep text upright regardless of item rotation.
      labelRotate: -f.rotation,
      selected: selected.has(`furniture:${f.id}`),
      overlap: overlaps.has(f.id),
    };
  });
  return [...items.filter((i) => i.floor), ...items.filter((i) => !i.floor)];
}

/** Wall length labels, placed on the side of the wall that is outside any room and kept upright. */
export function dimensionViews(segments: WallSegment[], rooms: Room[], units: DisplayUnits, zoom: number) {
  const px = 1 / zoom;
  return segments
    .filter((s) => s.length * zoom > MIN_DIMENSION_PX)
    .map((s) => {
      const mid = scale(add(s.a, s.b), 0.5);
      const probe = add(mid, scale(s.normal, s.wall.thickness / 2 + 4));
      const side = rooms.some((r) => pointInPolygon(probe, r.polygon)) ? -1 : 1;
      const pos = add(mid, scale(s.normal, side * (s.wall.thickness / 2 + 11 * px)));
      // Flip text that would read upside down; result is in (-90, 90].
      let angle = angleDeg(s.dir);
      if (angle > 90) angle -= 180;
      else if (angle <= -90) angle += 180;
      return { id: s.wall.id, x: pos.x, y: pos.y, angle, text: formatLength(s.length, units) };
    });
}

/** Resize and rotate handles for a single selected furniture item. */
export function handleView(f: FurnitureItem, units: DisplayUnits, px: number) {
  return {
    id: f.id,
    transform: transformOf(f.x, f.y, f.rotation),
    w: f.width,
    d: f.depth,
    size: 8 * px,
    rotateY: -f.depth / 2 - 26 * px,
    text: `${formatLength(f.width, units)} × ${formatLength(f.depth, units)}`,
    textY: f.depth / 2 + 16 * px,
    textRotate: -f.rotation,
  };
}

/** Transient tool feedback: wall draft, snap markers, opening preview, selection box, distances. */
export function overlayView(o: ToolOverlay, segmentById: ReadonlyMap<string, WallSegment>, units: DisplayUnits, px: number, tool: ToolId) {
  const chain = o.wallChain ?? [];
  const cursor = o.wallCursor ?? null;
  const last = chain.at(-1);
  let live: { x1: number; y1: number; x2: number; y2: number; label: string; lx: number; ly: number } | null = null;
  if (last && cursor && dist(last, cursor) > 0.5) {
    const mid = scale(add(last, cursor), 0.5);
    live = { x1: last.x, y1: last.y, x2: cursor.x, y2: cursor.y, label: formatLength(dist(last, cursor), units), lx: mid.x, ly: mid.y - 10 * px };
  }
  let preview: { transform: string; w: number; t: number } | null = null;
  const seg = o.openingPreview ? segmentById.get(o.openingPreview.wallId) : undefined;
  if (o.openingPreview && seg) {
    const c = add(seg.a, scale(seg.dir, o.openingPreview.offset));
    preview = { transform: transformOf(c.x, c.y, angleDeg(seg.dir)), w: o.openingPreview.width, t: seg.wall.thickness };
  }
  const box = o.box
    ? {
        x: Math.min(o.box.a.x, o.box.b.x),
        y: Math.min(o.box.a.y, o.box.b.y),
        w: Math.abs(o.box.a.x - o.box.b.x),
        h: Math.abs(o.box.a.y - o.box.b.y),
      }
    : null;
  const measures = (o.measures ?? []).map((m) => {
    const mid = scale(add(m.from, m.to), 0.5);
    return { ...m, text: formatLength(dist(m.from, m.to), units), mx: mid.x, my: mid.y };
  });
  return {
    chain: chain.length > 1 ? 'M' + chain.map((p) => `${p.x} ${p.y}`).join('L') : '',
    chainStart: chain[0] ?? null,
    live,
    cursor: tool === 'wall' ? cursor : null,
    snap: o.snapPoint ?? null,
    guides: o.guides ?? [],
    preview,
    box,
    measures,
  };
}
