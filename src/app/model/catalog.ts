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

// ---------------------------------------------------------------------------
// 2D top-down symbols, in local coordinates centered on the item (back edge at -depth/2).
// ---------------------------------------------------------------------------

export type SymbolPart =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; tone?: number }
  | { t: 'circle'; cx: number; cy: number; r: number; tone?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number };

/**
 * Detail parts drawn on top of the item's base outline. `tone` lightens (+) or darkens (-)
 * the item color. The base outline is drawn separately (rect or ellipse).
 */
export function symbolParts(shape: FurnitureShape, w: number, d: number): SymbolPart[] {
  const x0 = -w / 2;
  const y0 = -d / 2;
  const m = Math.min(w, d);
  switch (shape) {
    case 'sofa': {
      const back = d * 0.25;
      const arm = Math.min(w * 0.12, 18);
      const seatW = w - 2 * arm;
      const cushions = Math.max(1, Math.round(seatW / 70));
      const parts: SymbolPart[] = [
        { t: 'rect', x: x0, y: y0, w, h: back, r: 4, tone: -0.12 },
        { t: 'rect', x: x0, y: y0, w: arm, h: d, r: 4, tone: -0.12 },
        { t: 'rect', x: -x0 - arm, y: y0, w: arm, h: d, r: 4, tone: -0.12 },
      ];
      for (let i = 1; i < cushions; i++) {
        const x = x0 + arm + (seatW * i) / cushions;
        parts.push({ t: 'line', x1: x, y1: y0 + back, x2: x, y2: -y0 });
      }
      return parts;
    }
    case 'sectional': {
      const back = Math.min(d, w) * 0.2;
      const seat = Math.min(d, w) * 0.45;
      return [
        { t: 'rect', x: x0, y: y0, w, h: back, r: 4, tone: -0.12 },
        { t: 'rect', x: x0, y: y0, w: back, h: d, r: 4, tone: -0.12 },
        { t: 'rect', x: x0 + back, y: y0 + back + seat, w: w - back, h: d - back - seat, r: 0, tone: 0.5 },
        { t: 'line', x1: x0 + back + seat, y1: y0 + back + seat, x2: -x0, y2: y0 + back + seat },
      ];
    }
    case 'armchair': {
      const back = d * 0.25;
      const arm = w * 0.18;
      return [
        { t: 'rect', x: x0, y: y0, w, h: back, r: 4, tone: -0.12 },
        { t: 'rect', x: x0, y: y0, w: arm, h: d, r: 4, tone: -0.12 },
        { t: 'rect', x: -x0 - arm, y: y0, w: arm, h: d, r: 4, tone: -0.12 },
      ];
    }
    case 'chair':
      return [{ t: 'rect', x: x0, y: y0, w, h: d * 0.18, r: 2, tone: -0.15 }];
    case 'table':
    case 'desk':
    case 'coffee-table':
      return [{ t: 'rect', x: x0 + 3, y: y0 + 3, w: w - 6, h: d - 6, r: 2, tone: 0.08 }];
    case 'bed': {
      const pillowH = Math.min(d * 0.14, 28);
      const pillows = w > 120 ? 2 : 1;
      const gap = 6;
      const pw = (w - gap * (pillows + 1)) / pillows;
      const parts: SymbolPart[] = [{ t: 'rect', x: x0, y: y0, w, h: 8, tone: -0.3 }];
      for (let i = 0; i < pillows; i++) {
        parts.push({ t: 'rect', x: x0 + gap + i * (pw + gap), y: y0 + 12, w: pw, h: pillowH, r: 6, tone: 0.3 });
      }
      parts.push({ t: 'rect', x: x0, y: y0 + d * 0.38, w, h: d * 0.62, r: 2, tone: -0.08 });
      parts.push({ t: 'line', x1: x0, y1: y0 + d * 0.38, x2: -x0, y2: y0 + d * 0.38 });
      return parts;
    }
    case 'nightstand':
    case 'dresser':
      return [{ t: 'line', x1: x0, y1: -y0 - 4, x2: -x0, y2: -y0 - 4 }];
    case 'wardrobe':
      return [
        { t: 'line', x1: 0, y1: y0, x2: 0, y2: -y0 },
        { t: 'line', x1: x0, y1: y0 + d / 2, x2: -x0, y2: y0 + d / 2 },
      ];
    case 'bookshelf': {
      const parts: SymbolPart[] = [];
      const n = Math.max(2, Math.round(w / 30));
      for (let i = 1; i < n; i++) parts.push({ t: 'line', x1: x0 + (w * i) / n, y1: y0, x2: x0 + (w * i) / n, y2: -y0 });
      return parts;
    }
    case 'tv-stand':
      return [{ t: 'rect', x: -w * 0.4, y: y0 + 2, w: w * 0.8, h: Math.min(6, d * 0.3), tone: -0.5 }];
    case 'counter':
      return [{ t: 'line', x1: x0, y1: -y0 - 5, x2: -x0, y2: -y0 - 5 }];
    case 'fridge':
      return [
        { t: 'line', x1: x0, y1: -y0 - 5, x2: -x0, y2: -y0 - 5 },
        { t: 'line', x1: x0 + w * 0.15, y1: y0 + 6, x2: -x0 - w * 0.15, y2: -y0 - 12 },
      ];
    case 'stove': {
      const r = m * 0.16;
      return [
        { t: 'circle', cx: -w / 4, cy: -d / 4 + 4, r, tone: -0.4 },
        { t: 'circle', cx: w / 4, cy: -d / 4 + 4, r, tone: -0.4 },
        { t: 'circle', cx: -w / 4, cy: d / 4, r, tone: -0.4 },
        { t: 'circle', cx: w / 4, cy: d / 4, r, tone: -0.4 },
      ];
    }
    case 'sink':
      return [
        { t: 'rect', x: -w * 0.3, y: y0 + d * 0.25, w: w * 0.6, h: d * 0.55, r: 8, tone: 0.2 },
        { t: 'circle', cx: 0, cy: y0 + d * 0.15, r: 2, tone: -0.5 },
      ];
    case 'toilet':
      return [
        { t: 'rect', x: x0, y: y0, w, h: d * 0.3, r: 3, tone: -0.05 },
        { t: 'circle', cx: 0, cy: y0 + d * 0.62, r: Math.min(w * 0.42, d * 0.36), tone: 0.05 },
      ];
    case 'bathtub':
      return [{ t: 'rect', x: x0 + 8, y: y0 + 8, w: w - 16, h: d - 16, r: Math.min(w, d) * 0.3, tone: 0.2 }];
    case 'shower':
      return [
        { t: 'line', x1: x0, y1: y0, x2: -x0, y2: -y0 },
        { t: 'line', x1: -x0, y1: y0, x2: x0, y2: -y0 },
        { t: 'circle', cx: 0, cy: 0, r: 3, tone: -0.5 },
      ];
    case 'rug':
      return [{ t: 'rect', x: x0 + 6, y: y0 + 6, w: w - 12, h: d - 12, tone: 0.15 }];
    case 'plant':
      return [
        { t: 'circle', cx: -m * 0.15, cy: -m * 0.1, r: m * 0.22, tone: 0.15 },
        { t: 'circle', cx: m * 0.15, cy: m * 0.05, r: m * 0.2, tone: -0.1 },
        { t: 'circle', cx: -m * 0.05, cy: m * 0.18, r: m * 0.16, tone: 0.25 },
      ];
    case 'lamp':
      return [{ t: 'circle', cx: 0, cy: 0, r: m * 0.15, tone: -0.4 }];
    case 'stool':
    case 'round-table':
    case 'ottoman':
    case 'tv':
    case 'box':
    default:
      return [];
  }
}

/** Shapes drawn with an elliptical base outline instead of a rectangle. */
export function isRoundShape(shape: FurnitureShape): boolean {
  return shape === 'round-table' || shape === 'stool' || shape === 'plant' || shape === 'lamp';
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex color. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)),
  );
  return '#' + ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}
