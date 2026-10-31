/**
 * Edits to a plan draft, for use inside `PlanStore.update(draft => ...)`.
 * Each operation keeps the document consistent (openings stay on their walls, rotations stay
 * normalized, empty override objects are dropped). Low-level wall-graph editing lives in
 * `geometry/wall-geometry.ts`; these build on it.
 */
import { ceilingHeightAt } from '../geometry/elevation';
import { attachRoomMeta, detectRooms, Room } from '../geometry/room-detection';
import { add, angleDeg, scale } from '../geometry/vec';
import { clampOpeningOffset, nodeMap, reclampOpenings, WallSegment, wallSegment } from '../geometry/wall-geometry';
import { catalogItem, mountOf } from './catalog';
import { FurnitureItem, newId, Opening, Plan, RoomMeta, Wall, WallSide } from './plan.model';

/** Wraps an angle in degrees into (-180, 180]. */
export function normalizeRotation(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
}

export function updateWall(draft: Plan, id: string, patch: Partial<Pick<Wall, 'thickness' | 'height'>>): void {
  const w = draft.walls.find((x) => x.id === id);
  if (!w) return;
  Object.assign(w, patch);
  reclampOpenings(draft);
}

/** Sets the accent paint on one face of a wall, or clears it with `null`. */
export function setWallColor(draft: Plan, id: string, side: WallSide, color: string | null): void {
  const w = draft.walls.find((x) => x.id === id);
  if (!w) return;
  const colors = { ...w.colors };
  if (color) colors[side] = color;
  else delete colors[side];
  if (Object.keys(colors).length) w.colors = colors;
  else delete w.colors;
}

/** Updates a door or window, keeping it no wider than its wall and fully on it. */
export function updateOpening(draft: Plan, id: string, patch: Partial<Omit<Opening, 'id' | 'wallId'>>): void {
  const o = draft.openings.find((x) => x.id === id);
  if (!o) return;
  Object.assign(o, patch);
  const wall = draft.walls.find((w) => w.id === o.wallId);
  const seg = wall && wallSegment(wall, nodeMap(draft));
  if (!seg) return;
  o.width = Math.min(o.width, seg.length);
  o.offset = clampOpeningOffset(o.offset, o.width, seg.length);
}

/** Updates an item. Its elevation stays between the floor and the ceiling above it. */
export function updateFurniture(draft: Plan, id: string, patch: Partial<Omit<FurnitureItem, 'id'>>): void {
  const f = draft.furniture.find((x) => x.id === id);
  if (!f) return;
  Object.assign(f, patch);
  if (patch.rotation !== undefined) f.rotation = normalizeRotation(f.rotation);
  if (patch.label !== undefined && !patch.label.trim()) delete f.label;
  if (f.elevation !== undefined) clampElevation(draft, f);
}

function clampElevation(draft: Plan, f: FurnitureItem): void {
  const ceiling = ceilingHeightAt(attachRoomMeta(detectRooms(draft), []), f);
  const e = Number.isFinite(f.elevation) ? f.elevation! : 0;
  f.elevation = Math.min(Math.max(0, e), Math.max(0, ceiling - f.height));
  if (f.elevation === 0 && mountOf(catalogItem(f.catalogId)) === 'floor') delete f.elevation;
}

/**
 * Hangs an item flush on one face of a wall: centered `along` from node `a` (kept on the wall),
 * back against the face, with its bottom at `elevation` (kept below the ceiling).
 */
export function moveOnWall(draft: Plan, id: string, seg: WallSegment, side: WallSide, along: number, elevation: number): void {
  const f = draft.furniture.find((x) => x.id === id);
  if (!f) return;
  const outward = scale(seg.normal, side === 'front' ? 1 : -1);
  const half = Math.min(f.width / 2, seg.length / 2);
  const at = Math.min(Math.max(along, half), seg.length - half);
  const p = add(add(seg.a, scale(seg.dir, at)), scale(outward, seg.wall.thickness / 2 + f.depth / 2));
  f.x = Math.round(p.x * 10) / 10;
  f.y = Math.round(p.y * 10) / 10;
  f.rotation = normalizeRotation(Math.round(angleDeg(outward) - 90));
  f.elevation = elevation;
  clampElevation(draft, f);
}

/** Sets the height of every wall around a room. Walls shared with a neighboring room change for it too. */
export function setRoomCeilingHeight(draft: Plan, room: Room, height: number): void {
  for (const id of room.wallIds) updateWall(draft, id, { height });
}

/** Draws an item with an uploaded model, or with the catalog's built-in model for `undefined`. */
export function setFurnitureModel(draft: Plan, id: string, modelId: string | undefined): void {
  const f = draft.furniture.find((x) => x.id === id);
  if (!f) return;
  if (modelId) f.modelId = modelId;
  else delete f.modelId;
}

/** Points furniture at renamed model ids, for example after an import resolved an id clash. */
export function remapFurnitureModels(draft: Plan, ids: ReadonlyMap<string, string>): void {
  for (const f of draft.furniture) {
    const next = f.modelId && ids.get(f.modelId);
    if (next) f.modelId = next;
  }
}

/**
 * Shows an uploaded picture on an art item, or clears it with `undefined`. With `aspect` (image
 * height / width), the item's height changes so the frame keeps the picture's proportions.
 */
export function setFurnitureArt(draft: Plan, id: string, imageId: string | undefined, aspect?: number): void {
  const f = draft.furniture.find((x) => x.id === id);
  if (!f) return;
  if (imageId) f.artImageId = imageId;
  else delete f.artImageId;
  if (aspect && Number.isFinite(aspect) && aspect > 0) f.height = Math.round(f.width * aspect * 10) / 10;
}

/** Points art at renamed image ids, for example after an import resolved an id clash. */
export function remapFurnitureArt(draft: Plan, ids: ReadonlyMap<string, string>): void {
  for (const f of draft.furniture) {
    const next = f.artImageId && ids.get(f.artImageId);
    if (next) f.artImageId = next;
  }
}

/** Restores an item's catalog width, depth and height. */
export function resetFurnitureSize(draft: Plan, id: string): void {
  const f = draft.furniture.find((x) => x.id === id);
  if (!f) return;
  const c = catalogItem(f.catalogId);
  Object.assign(f, { width: c.width, depth: c.depth, height: c.height });
}

export type RoomPatch = Partial<Omit<RoomMeta, 'id' | 'anchor'>>;

/**
 * Updates a detected room's name, colors or finishes, creating its metadata on first edit. The anchor is
 * moved to the room's current label point so it stays inside the room as walls change.
 */
export function upsertRoomMeta(draft: Plan, room: Room, patch: RoomPatch): void {
  let meta = room.meta ? draft.rooms.find((m) => m.id === room.meta!.id) : undefined;
  if (!meta) {
    meta = { id: newId('r'), anchor: room.label, name: room.name, floorColor: room.floorColor, wallColor: room.wallColor };
    draft.rooms.push(meta);
  }
  meta.anchor = room.label;
  Object.assign(meta, patch);
}
