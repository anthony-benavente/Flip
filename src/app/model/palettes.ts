/** Every paint color, floor material and room color scheme the app offers or falls back to. */
import { FloorMaterial } from './plan.model';

export interface Swatch {
  name: string;
  color: string;
}

export const DEFAULT_FLOOR_COLOR = '#d9c3a0';
export const DEFAULT_WALL_COLOR = '#f2efe9';
export const DEFAULT_CEILING_COLOR = '#f7f6f3';
export const DEFAULT_TRIM_COLOR = '#f4f2ee';
export const DEFAULT_FLOOR_MATERIAL: FloorMaterial = 'solid';
/** Paint of wall faces that are outside every room. */
export const EXTERIOR_WALL_COLOR = '#e4dfd6';

export const FLOOR_SWATCHES: Swatch[] = [
  { name: 'Oak', color: '#c9a77c' },
  { name: 'Light wood', color: '#e3cda4' },
  { name: 'Walnut', color: '#7d5a3c' },
  { name: 'Gray tile', color: '#b9bbbd' },
  { name: 'White tile', color: '#ecebe7' },
  { name: 'Carpet', color: '#cdbfae' },
  { name: 'Concrete', color: '#9e9b96' },
];

export const WALL_SWATCHES: Swatch[] = [
  { name: 'White', color: '#f7f6f3' },
  { name: 'Warm white', color: '#efe9df' },
  { name: 'Greige', color: '#d6cfc3' },
  { name: 'Sage', color: '#b9c4ad' },
  { name: 'Blue gray', color: '#a9b6c2' },
  { name: 'Terracotta', color: '#c98b6b' },
  { name: 'Charcoal', color: '#55575b' },
];

/** Bolder paints for accent walls. */
export const ACCENT_SWATCHES: Swatch[] = [
  { name: 'Navy', color: '#2f4a6d' },
  { name: 'Forest', color: '#3f6b4f' },
  { name: 'Teal', color: '#2f7f80' },
  { name: 'Terracotta', color: '#c06a4a' },
  { name: 'Mustard', color: '#d4a537' },
  { name: 'Blush', color: '#d9a6a1' },
  { name: 'Charcoal', color: '#3d3f44' },
  { name: 'Sage', color: '#b9c4ad' },
];

export const FURNITURE_SWATCHES: Swatch[] = ['#7a8ca3', '#b08d6e', '#8b6b4a', '#3c3f44', '#e6e1d8', '#5f8a4f', '#a83f3f', '#d9b44a', '#c9ccd1', '#f4f4f2'].map(
  (color) => ({ name: color, color }),
);

export const CEILING_SWATCHES: Swatch[] = [
  { name: 'White', color: '#f7f6f3' },
  { name: 'Warm white', color: '#efe9df' },
  { name: 'Soft gray', color: '#e3e1dc' },
  { name: 'Pale blue', color: '#dbe6ec' },
  { name: 'Blush', color: '#f3e6e1' },
  { name: 'Charcoal', color: '#4a4c50' },
  { name: 'Wood', color: '#b08d6e' },
];

export const DEFAULT_DOOR_COLOR = '#b48b5e';

export const DOOR_SWATCHES: Swatch[] = [
  { name: 'Natural wood', color: DEFAULT_DOOR_COLOR },
  { name: 'White', color: '#f4f2ee' },
  { name: 'Walnut', color: '#6b4a33' },
  { name: 'Black', color: '#2b2b2b' },
  { name: 'Navy', color: '#2f4a6d' },
  { name: 'Forest', color: '#3f5e4a' },
  { name: 'Red', color: '#a83f3f' },
  { name: 'Gray', color: '#8a8d92' },
];

export const TRIM_SWATCHES: Swatch[] = [
  { name: 'White', color: '#f4f2ee' },
  { name: 'Warm white', color: '#efe9df' },
  { name: 'Greige', color: '#cfc6b8' },
  { name: 'Oak', color: '#b8956a' },
  { name: 'Walnut', color: '#6b4a33' },
  { name: 'Navy', color: '#2f4a6d' },
  { name: 'Black', color: '#2b2b2b' },
];

export const FLOOR_MATERIALS: { id: FloorMaterial; name: string }[] = [
  { id: 'solid', name: 'Plain' },
  { id: 'wood', name: 'Wood' },
  { id: 'tile', name: 'Tile' },
  { id: 'carpet', name: 'Carpet' },
  { id: 'concrete', name: 'Concrete' },
];

/** Every finish of a room that a color scheme sets. */
export interface RoomFinishes {
  floorColor: string;
  floorMaterial: FloorMaterial;
  wallColor: string;
  ceilingColor: string;
  trimColor: string;
}

export interface RoomScheme extends RoomFinishes {
  name: string;
  /** Suggested paint for an accent wall in this room. */
  accent: string;
}

/** Curated finishes that are applied to a room together. */
export const ROOM_SCHEMES: RoomScheme[] = [
  { name: 'Scandinavian', floorColor: '#e3cda4', floorMaterial: 'wood', wallColor: '#f7f6f3', ceilingColor: '#f7f6f3', trimColor: '#f4f2ee', accent: '#b9c4ad' },
  { name: 'Warm modern', floorColor: '#b8956a', floorMaterial: 'wood', wallColor: '#efe9df', ceilingColor: '#f7f6f3', trimColor: '#efe9df', accent: '#c06a4a' },
  { name: 'Coastal', floorColor: '#e8dcc4', floorMaterial: 'wood', wallColor: '#e7eef0', ceilingColor: '#f7f6f3', trimColor: '#fbfbf9', accent: '#2f7f80' },
  { name: 'Classic', floorColor: '#7d5a3c', floorMaterial: 'wood', wallColor: '#f2efe9', ceilingColor: '#fbfbf9', trimColor: '#fbfbf9', accent: '#2f4a6d' },
  { name: 'Earthy', floorColor: '#c9b49a', floorMaterial: 'tile', wallColor: '#e6d7c3', ceilingColor: '#f2ece2', trimColor: '#cfc6b8', accent: '#3f6b4f' },
  { name: 'Soft blush', floorColor: '#cdbfae', floorMaterial: 'carpet', wallColor: '#f3e6e1', ceilingColor: '#fbfbf9', trimColor: '#fbfbf9', accent: '#d9a6a1' },
  { name: 'Industrial', floorColor: '#9e9b96', floorMaterial: 'concrete', wallColor: '#d6d3ce', ceilingColor: '#55575b', trimColor: '#3d3f44', accent: '#55575b' },
  { name: 'Moody', floorColor: '#5c4433', floorMaterial: 'wood', wallColor: '#3d4a52', ceilingColor: '#3d4a52', trimColor: '#2f383e', accent: '#d4a537' },
];

/** The scheme whose finishes a room currently has, if any. */
export function matchingScheme(room: RoomFinishes): RoomScheme | null {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return (
    ROOM_SCHEMES.find(
      (s) =>
        same(s.floorColor, room.floorColor) &&
        s.floorMaterial === room.floorMaterial &&
        same(s.wallColor, room.wallColor) &&
        same(s.ceilingColor, room.ceilingColor) &&
        same(s.trimColor, room.trimColor),
    ) ?? null
  );
}

/** The finishes a scheme applies, without its name and accent suggestion. */
export function schemeFinishes({ floorColor, floorMaterial, wallColor, ceilingColor, trimColor }: RoomScheme): RoomFinishes {
  return { floorColor, floorMaterial, wallColor, ceilingColor, trimColor };
}
