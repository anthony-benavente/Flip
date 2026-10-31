/** Every paint color the app offers or falls back to. */

export interface Swatch {
  name: string;
  color: string;
}

export const DEFAULT_FLOOR_COLOR = '#d9c3a0';
export const DEFAULT_WALL_COLOR = '#f2efe9';
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
