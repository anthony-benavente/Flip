/** Furniture catalog. Dimensions are centimeters: width (x), depth (y, back at -y), height. */

export type FurnitureShape =
  | 'sofa'
  | 'sectional'
  | 'armchair'
  | 'chair'
  | 'stool'
  | 'ottoman'
  | 'table'
  | 'round-table'
  | 'coffee-table'
  | 'desk'
  | 'bed'
  | 'nightstand'
  | 'dresser'
  | 'wardrobe'
  | 'bookshelf'
  | 'tv-stand'
  | 'tv'
  | 'counter'
  | 'fridge'
  | 'stove'
  | 'sink'
  | 'toilet'
  | 'bathtub'
  | 'shower'
  | 'rug'
  | 'plant'
  | 'lamp'
  | 'box';

export type FurnitureCategory = 'Seating' | 'Tables' | 'Bedroom' | 'Storage' | 'Kitchen & Bath' | 'Decor';

export interface CatalogItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  shape: FurnitureShape;
  width: number;
  depth: number;
  height: number;
  color: string;
  /** Lies on the floor under other items (rugs); excluded from overlap warnings. */
  floorLayer?: boolean;
  /** Not pushed against walls when dropped near one. */
  noWallSnap?: boolean;
}

const IN = 2.54;

export const CATALOG: CatalogItem[] = [
  { id: 'sofa-3', name: 'Sofa', category: 'Seating', shape: 'sofa', width: 84 * IN, depth: 36 * IN, height: 34 * IN, color: '#7a8ca3' },
  { id: 'loveseat', name: 'Loveseat', category: 'Seating', shape: 'sofa', width: 60 * IN, depth: 35 * IN, height: 34 * IN, color: '#7a8ca3' },
  { id: 'sectional', name: 'Sectional', category: 'Seating', shape: 'sectional', width: 112 * IN, depth: 80 * IN, height: 34 * IN, color: '#8a8f99' },
  { id: 'armchair', name: 'Armchair', category: 'Seating', shape: 'armchair', width: 34 * IN, depth: 34 * IN, height: 34 * IN, color: '#b08d6e' },
  { id: 'dining-chair', name: 'Dining chair', category: 'Seating', shape: 'chair', width: 18 * IN, depth: 20 * IN, height: 36 * IN, color: '#8b6b4a', noWallSnap: true },
  { id: 'office-chair', name: 'Office chair', category: 'Seating', shape: 'chair', width: 26 * IN, depth: 26 * IN, height: 40 * IN, color: '#3c3f44', noWallSnap: true },
  { id: 'stool', name: 'Bar stool', category: 'Seating', shape: 'stool', width: 16 * IN, depth: 16 * IN, height: 30 * IN, color: '#5b4636', noWallSnap: true },
  { id: 'ottoman', name: 'Ottoman', category: 'Seating', shape: 'ottoman', width: 30 * IN, depth: 20 * IN, height: 17 * IN, color: '#a3836a', noWallSnap: true },

  { id: 'dining-table-6', name: 'Dining table', category: 'Tables', shape: 'table', width: 72 * IN, depth: 38 * IN, height: 30 * IN, color: '#9c7349', noWallSnap: true },
  { id: 'dining-table-4', name: 'Small dining table', category: 'Tables', shape: 'table', width: 48 * IN, depth: 30 * IN, height: 30 * IN, color: '#9c7349', noWallSnap: true },
  { id: 'round-table', name: 'Round table', category: 'Tables', shape: 'round-table', width: 42 * IN, depth: 42 * IN, height: 30 * IN, color: '#9c7349', noWallSnap: true },
  { id: 'coffee-table', name: 'Coffee table', category: 'Tables', shape: 'coffee-table', width: 48 * IN, depth: 24 * IN, height: 18 * IN, color: '#6e5038', noWallSnap: true },
  { id: 'side-table', name: 'Side table', category: 'Tables', shape: 'round-table', width: 20 * IN, depth: 20 * IN, height: 24 * IN, color: '#6e5038', noWallSnap: true },
  { id: 'desk', name: 'Desk', category: 'Tables', shape: 'desk', width: 55 * IN, depth: 26 * IN, height: 30 * IN, color: '#c4a57c' },

  { id: 'bed-queen', name: 'Queen bed', category: 'Bedroom', shape: 'bed', width: 64 * IN, depth: 84 * IN, height: 24 * IN, color: '#e6e1d8' },
  { id: 'bed-king', name: 'King bed', category: 'Bedroom', shape: 'bed', width: 80 * IN, depth: 84 * IN, height: 24 * IN, color: '#e6e1d8' },
  { id: 'bed-full', name: 'Full bed', category: 'Bedroom', shape: 'bed', width: 57 * IN, depth: 79 * IN, height: 22 * IN, color: '#e6e1d8' },
  { id: 'bed-twin', name: 'Twin bed', category: 'Bedroom', shape: 'bed', width: 42 * IN, depth: 79 * IN, height: 22 * IN, color: '#e6e1d8' },
  { id: 'nightstand', name: 'Nightstand', category: 'Bedroom', shape: 'nightstand', width: 22 * IN, depth: 18 * IN, height: 26 * IN, color: '#8b6b4a' },
  { id: 'dresser', name: 'Dresser', category: 'Bedroom', shape: 'dresser', width: 60 * IN, depth: 20 * IN, height: 34 * IN, color: '#8b6b4a' },

  { id: 'wardrobe', name: 'Wardrobe', category: 'Storage', shape: 'wardrobe', width: 48 * IN, depth: 24 * IN, height: 78 * IN, color: '#a88a68' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'Storage', shape: 'bookshelf', width: 36 * IN, depth: 12 * IN, height: 72 * IN, color: '#a88a68' },
  { id: 'tv-stand', name: 'TV stand', category: 'Storage', shape: 'tv-stand', width: 60 * IN, depth: 16 * IN, height: 22 * IN, color: '#4a4440' },
  { id: 'tv', name: 'TV (65")', category: 'Storage', shape: 'tv', width: 57 * IN, depth: 10 * IN, height: 35 * IN, color: '#1e1f22' },

  { id: 'counter', name: 'Counter', category: 'Kitchen & Bath', shape: 'counter', width: 72 * IN, depth: 25 * IN, height: 36 * IN, color: '#d8d4cc' },
  { id: 'island', name: 'Kitchen island', category: 'Kitchen & Bath', shape: 'counter', width: 72 * IN, depth: 36 * IN, height: 36 * IN, color: '#d8d4cc', noWallSnap: true },
  { id: 'fridge', name: 'Refrigerator', category: 'Kitchen & Bath', shape: 'fridge', width: 36 * IN, depth: 30 * IN, height: 70 * IN, color: '#c9ccd1' },
  { id: 'stove', name: 'Stove', category: 'Kitchen & Bath', shape: 'stove', width: 30 * IN, depth: 26 * IN, height: 36 * IN, color: '#b9bcc2' },
  { id: 'sink', name: 'Sink vanity', category: 'Kitchen & Bath', shape: 'sink', width: 30 * IN, depth: 21 * IN, height: 34 * IN, color: '#e9e7e2' },
  { id: 'toilet', name: 'Toilet', category: 'Kitchen & Bath', shape: 'toilet', width: 20 * IN, depth: 28 * IN, height: 30 * IN, color: '#f4f4f2' },
  { id: 'bathtub', name: 'Bathtub', category: 'Kitchen & Bath', shape: 'bathtub', width: 60 * IN, depth: 30 * IN, height: 20 * IN, color: '#f4f4f2' },
  { id: 'shower', name: 'Shower', category: 'Kitchen & Bath', shape: 'shower', width: 36 * IN, depth: 36 * IN, height: 80 * IN, color: '#dfe7ea' },

  { id: 'rug-large', name: 'Rug 8×10', category: 'Decor', shape: 'rug', width: 120 * IN, depth: 96 * IN, height: 1, color: '#b5a48d', floorLayer: true, noWallSnap: true },
  { id: 'rug-small', name: 'Rug 5×8', category: 'Decor', shape: 'rug', width: 96 * IN, depth: 60 * IN, height: 1, color: '#9d7f6e', floorLayer: true, noWallSnap: true },
  { id: 'plant', name: 'Plant', category: 'Decor', shape: 'plant', width: 20 * IN, depth: 20 * IN, height: 48 * IN, color: '#5f8a4f', noWallSnap: true },
  { id: 'floor-lamp', name: 'Floor lamp', category: 'Decor', shape: 'lamp', width: 14 * IN, depth: 14 * IN, height: 64 * IN, color: '#d9c9a3', noWallSnap: true },
  { id: 'box', name: 'Generic box', category: 'Decor', shape: 'box', width: 24 * IN, depth: 24 * IN, height: 24 * IN, color: '#a0a0a0' },
];

export const CATALOG_CATEGORIES: FurnitureCategory[] = ['Seating', 'Tables', 'Bedroom', 'Storage', 'Kitchen & Bath', 'Decor'];

const byId = new Map(CATALOG.map((c) => [c.id, c]));

export function catalogItem(id: string): CatalogItem {
  return byId.get(id) ?? CATALOG[CATALOG.length - 1];
}
