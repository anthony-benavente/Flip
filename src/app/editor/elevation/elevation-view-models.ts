/**
 * Pure builders for the wall elevation view: one wall face seen straight on from its room.
 * Drawing coordinates are centimeters with x running left to right along the face as the viewer
 * sees it (0 at the left end) and y = -(height above the floor), so SVG's y-down puts the floor
 * at the bottom.
 */
import { itemElevation, mountedWall } from '../../geometry/elevation';
import { Room, roomsBesideWall, wallFaceColor } from '../../geometry/room-detection';
import { formatLength } from '../../geometry/units';
import { dot, rectCorners, scale, sub } from '../../geometry/vec';
import { WallSegment } from '../../geometry/wall-geometry';
import { BASEBOARD, CROWN, wallPieces } from '../../geometry/wall-pieces';
import { catalogItem, EYE_LEVEL, mountOf } from '../../model/catalog';
import { EXTERIOR_WALL_COLOR } from '../../model/palettes';
import { DisplayUnits, FurnitureItem, Opening, Point, WallSide } from '../../model/plan.model';
import { SelectedIds } from '../canvas/view-models';

/** Furniture this close to the face (cm) shows as a silhouette in front of it. */
export const NEARBY_DISTANCE = 60;
/** Art usually hangs this far above the furniture below it (cm). */
export const ART_GAP = { min: 15, max: 25 };

/** Maps between plan positions and the face's horizontal axis. */
export interface FaceFrame {
  seg: WallSegment;
  side: WallSide;
  length: number;
  height: number;
  /** Unit vector from the face into the room, toward the viewer. */
  outward: Point;
  /** Horizontal drawing position of a distance along the wall from node `a`. */
  toX(along: number): number;
  /** Distance along the wall from node `a` of a horizontal drawing position. */
  toAlong(x: number): number;
}

/**
 * The face as seen from its own side. Standing in front of the front face (on the normal's side)
 * the viewer's right is the wall's direction `a → b`; in front of the back face it is `b → a`.
 */
export function faceFrame(seg: WallSegment, side: WallSide): FaceFrame {
  const front = side === 'front';
  const length = seg.length;
  return {
    seg,
    side,
    length,
    height: seg.wall.height,
    outward: scale(seg.normal, front ? 1 : -1),
    toX: (along) => (front ? along : length - along),
    toAlong: (x) => (front ? x : length - x),
  };
}

export interface ElevationInput {
  seg: WallSegment;
  side: WallSide;
  segments: WallSegment[];
  furniture: FurnitureItem[];
  openings: Opening[];
  rooms: Room[];
  selected: SelectedIds;
  units: DisplayUnits;
  /** Object URL of an uploaded picture, when it has loaded. */
  imageUrl?: (imageId: string) => string | undefined;
}

export interface ElevationRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ElevationItem extends ElevationRect {
  id: string;
  shape: string;
  color: string;
  label: string;
  image: string | null;
  selected: boolean;
  /** "4' 9" center" for the selected item. */
  heightLabel: string | null;
}

export interface ElevationSilhouette extends ElevationRect {
  id: string;
  label: string;
}

export interface ElevationGuide {
  y: number;
  kind: 'floor' | 'ceiling' | 'eye' | 'top';
  label: string;
}

export function elevationView(input: ElevationInput) {
  const { seg, side, units } = input;
  const frame = faceFrame(seg, side);
  const L = frame.length;
  const H = frame.height;
  const room = roomsBesideWall(seg, input.rooms)[side];
  const span = (along0: number, along1: number) => {
    const x0 = Math.max(0, Math.min(frame.toX(along0), frame.toX(along1)));
    const x1 = Math.min(L, Math.max(frame.toX(along0), frame.toX(along1)));
    return { x: x0, w: Math.max(0, x1 - x0) };
  };
  const box = (along0: number, along1: number, bottom: number, top: number): ElevationRect => ({ ...span(along0, along1), y: -top, h: top - bottom });

  // Wall pieces use x centered on the wall's midpoint; shift to distances from node a.
  const pieces = wallPieces(
    { length: L, thickness: seg.wall.thickness, height: H },
    input.openings.filter((o) => o.wallId === seg.wall.id),
  );
  const openings = pieces.openings.map((o) => ({ kind: o.opening.kind, ...box(o.x0 + L / 2, o.x1 + L / 2, o.sill, o.top) }));
  const trimColor = room?.trimColor ?? null;
  const trim: ElevationRect[] = [];
  if (room) {
    for (const b of pieces.solids) {
      if (b.y0 < 0.01) trim.push(box(b.x0 + L / 2, b.x1 + L / 2, 0, Math.min(BASEBOARD.height, b.y1)));
      if (room.crownMolding && b.y1 > H - 0.01) trim.push(box(b.x0 + L / 2, b.x1 + L / 2, H - CROWN.height, H));
    }
  }

  const items: ElevationItem[] = [];
  const silhouettes: ElevationSilhouette[] = [];
  for (const f of input.furniture) {
    const c = catalogItem(f.catalogId);
    const bottom = itemElevation(f, input.rooms);
    const mount = mountedWall(f, input.segments);
    if (mount) {
      if (mount.seg.wall.id !== seg.wall.id || mount.side !== side) continue;
      const selected = input.selected.has(`furniture:${f.id}`);
      items.push({
        id: f.id,
        ...box(mount.along - f.width / 2, mount.along + f.width / 2, bottom, bottom + f.height),
        shape: c.shape,
        color: f.color,
        label: f.label || c.name,
        image: (f.artImageId && input.imageUrl?.(f.artImageId)) || null,
        selected,
        heightLabel: selected ? `${formatLength(bottom + f.height / 2, units)} center` : null,
      });
      continue;
    }
    if (c.floorLayer || mountOf(c) === 'wall') continue;
    const near = nearFace(frame, rectCorners(f, f.width, f.depth, f.rotation));
    if (!near) continue;
    const rect = box(near.along0, near.along1, bottom, bottom + f.height);
    if (rect.w > 0) silhouettes.push({ id: f.id, ...rect, label: f.label || c.name });
  }
  // Farther back first is not knowable from the face alone; lower items first keeps tops visible.
  silhouettes.sort((a, b) => b.y - a.y);

  const guides: ElevationGuide[] = [
    { y: 0, kind: 'floor', label: 'Floor' },
    { y: -H, kind: 'ceiling', label: `Ceiling ${formatLength(H, units)}` },
    { y: -EYE_LEVEL, kind: 'eye', label: `Eye level ${formatLength(EYE_LEVEL, units)}` },
  ];
  const tops = new Set<number>();
  for (const s of silhouettes) {
    const top = Math.round(-s.y);
    if (top >= H - 1 || tops.has(top)) continue;
    tops.add(top);
    guides.push({ y: s.y, kind: 'top', label: `${s.label} ${formatLength(-s.y, units)}` });
  }
  // Where art would hang above low furniture.
  const artBands = silhouettes
    .filter((s) => -s.y < EYE_LEVEL)
    .map((s) => ({ x: s.x, w: s.w, y: s.y - ART_GAP.max, h: ART_GAP.max - ART_GAP.min }));

  return {
    width: L,
    height: H,
    title: room ? `${room.name} wall` : 'Outside wall',
    wallColor: wallFaceColor(seg, side, room) ?? EXTERIOR_WALL_COLOR,
    ceilingColor: room?.ceilingColor ?? null,
    trimColor,
    trim,
    openings,
    silhouettes,
    items,
    guides,
    artBands,
  };
}

export type ElevationView = ReturnType<typeof elevationView>;

/**
 * The part of an item's footprint that stands in front of the face, as distances along the wall,
 * or null when the item is behind the wall, farther than `NEARBY_DISTANCE`, or off its ends.
 */
function nearFace(frame: FaceFrame, corners: Point[]): { along0: number; along1: number } | null {
  const { seg, outward } = frame;
  const half = seg.wall.thickness / 2;
  const along = corners.map((p) => dot(sub(p, seg.a), seg.dir));
  const gap = corners.map((p) => dot(sub(p, seg.a), outward) - half);
  if (Math.max(...gap) < -1 || Math.min(...gap) > NEARBY_DISTANCE) return null;
  const along0 = Math.max(0, Math.min(...along));
  const along1 = Math.min(frame.length, Math.max(...along));
  return along1 > along0 ? { along0, along1 } : null;
}
