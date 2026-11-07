/** All lengths are centimeters, all angles are degrees. */

export type DisplayUnits = 'imperial' | 'metric';

export interface Point {
  x: number;
  y: number;
}

export interface WallNode extends Point {
  id: string;
}

export interface Wall {
  id: string;
  /** Start node id. */
  a: string;
  /** End node id. */
  b: string;
  thickness: number;
  height: number;
  /**
   * Paint overrides for each face of the wall (accent walls). `front` is the face on the side the
   * wall's normal points to (`perp(b - a)`), `back` is the opposite face. Unset faces use the color
   * of the room on that side.
   */
  colors?: WallColors;
  /** Unset for a solid wall. Other types still bound rooms and keep `height` for the room's ceiling. */
  type?: WallType;
}

/**
 * `railing`: an open railing `RAILING.height` tall, such as over a stairwell.
 * `hidden`: an invisible room divider (open plans); nothing is built in 3D.
 */
export type WallType = 'railing' | 'hidden';

export type WallSide = 'front' | 'back';
export type WallColors = Partial<Record<WallSide, string>>;

export type OpeningKind = 'door' | 'window';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distance from wall node `a` to the opening's center, along the wall. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom edge above the floor (0 for doors). */
  sillHeight: number;
  /** Which side the hinge is on, seen from node `a` looking toward `b`. */
  swing?: 'left' | 'right';
  /** Door opens to the other side of the wall. */
  flip?: boolean;
  /** Paint of a door leaf; unset uses `DEFAULT_DOOR_COLOR`. */
  color?: string;
}

export interface FurnitureItem {
  id: string;
  catalogId: string;
  /** Center position. */
  x: number;
  y: number;
  rotation: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  label?: string;
  /** Uploaded 3D model (`CustomModel.id`) drawn instead of the catalog's built-in model. */
  modelId?: string;
  /**
   * Height of the item's bottom above the floor (items on walls or stacked on furniture).
   * Ignored for ceiling items, which hang from the ceiling; use `itemElevation` to read it.
   */
  elevation?: number;
  /** Uploaded picture (`ArtImage.id`) shown on art items. */
  artImageId?: string;
}

export interface RoomMeta {
  id: string;
  /** Any point inside the room. The derived room containing it owns this metadata. */
  anchor: Point;
  name: string;
  floorColor: string;
  wallColor: string;
  /** Unset finishes use the defaults in `palettes.ts`. */
  ceilingColor?: string;
  /** Baseboards, crown molding and door and window casings. */
  trimColor?: string;
  floorMaterial?: FloorMaterial;
  crownMolding?: boolean;
}

/** Surface pattern of a floor; its color comes from `RoomMeta.floorColor`. */
export type FloorMaterial = 'solid' | 'wood' | 'tile' | 'carpet' | 'concrete';

export interface Plan {
  id: string;
  name: string;
  schemaVersion: number;
  updatedAt: string;
  displayUnits: DisplayUnits;
  nodes: WallNode[];
  walls: Wall[];
  openings: Opening[];
  furniture: FurnitureItem[];
  rooms: RoomMeta[];
}

export const CURRENT_SCHEMA_VERSION = 1;

export interface PlanSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export function newId(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${rand}` : rand;
}
