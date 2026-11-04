/** 2D top-down drawings of furniture, in local coordinates centered on the item (back edge at -depth/2). */
import { FurnitureShape } from './catalog';

export type SymbolPart =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; tone?: number }
  | { t: 'circle'; cx: number; cy: number; r: number; tone?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number };

/**
 * Burner centers and radii of a five-burner cooktop, centered on the item with the back at -d/2.
 * Works in any length unit; the 2D symbol and the 3D mesh share it.
 */
export function cooktopBurners(w: number, d: number): { x: number; y: number; r: number }[] {
  const m = Math.min(w, d);
  return [
    { x: -w * 0.36, y: -d * 0.2, r: m * 0.1 },
    { x: -w * 0.36, y: d * 0.2, r: m * 0.12 },
    { x: 0, y: -d * 0.08, r: m * 0.13 },
    { x: w * 0.36, y: -d * 0.2, r: m * 0.1 },
    { x: w * 0.36, y: d * 0.2, r: m * 0.12 },
  ];
}

/** Depth of the knob strip at the front center of a cooktop, where the middle grate stops. */
export function cooktopKnobStrip(d: number): number {
  return d * 0.18;
}

/** Knob positions along the front center of a cooktop. */
export function cooktopKnobs(w: number, d: number): { x: number; y: number }[] {
  return [-2, -1, 0, 1, 2].map((i) => ({ x: i * w * 0.07, y: d / 2 - cooktopKnobStrip(d) / 2 }));
}

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
    case 'cooktop':
      return [
        { t: 'line', x1: x0 + w / 3, y1: y0, x2: x0 + w / 3, y2: -y0 },
        { t: 'line', x1: -x0 - w / 3, y1: y0, x2: -x0 - w / 3, y2: -y0 },
        ...cooktopBurners(w, d).map((b): SymbolPart => ({ t: 'circle', cx: b.x, cy: b.y, r: b.r, tone: -0.6 })),
        ...cooktopKnobs(w, d).map((k): SymbolPart => ({ t: 'circle', cx: k.x, cy: k.y, r: Math.min(1.8, w * 0.02), tone: 0.3 })),
      ];
    case 'oven-tower': {
      // Stainless appliance face along the front edge.
      const aw = Math.min(w - 8, 76);
      return [{ t: 'rect', x: -aw / 2, y: -y0 - 4, w: aw, h: 4, tone: -0.35 }];
    }
    case 'range-hood': {
      const cw = Math.min(w * 0.35, 30);
      const cd = Math.min(d * 0.55, 25);
      return [
        { t: 'rect', x: -cw / 2, y: y0, w: cw, h: cd, tone: -0.15 },
        { t: 'line', x1: -cw / 2, y1: y0 + cd, x2: x0, y2: -y0 },
        { t: 'line', x1: cw / 2, y1: y0 + cd, x2: -x0, y2: -y0 },
      ];
    }
    case 'base-cabinet':
      return [{ t: 'line', x1: x0, y1: -y0 - 5, x2: -x0, y2: -y0 - 5 }];
    case 'wall-cabinet':
      return [{ t: 'line', x1: x0, y1: y0, x2: -x0, y2: -y0 }];
    case 'pantry':
      return [
        { t: 'line', x1: x0, y1: y0, x2: -x0, y2: -y0 },
        { t: 'line', x1: -x0, y1: y0, x2: x0, y2: -y0 },
      ];
    case 'kitchen-sink':
      return [
        { t: 'rect', x: x0 + w * 0.08, y: y0 + d * 0.3, w: w * 0.84, h: d * 0.6, r: 4, tone: -0.2 },
        { t: 'circle', cx: 0, cy: y0 + d * 0.15, r: 2.5, tone: -0.5 },
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
    case 'table-lamp':
    case 'pendant':
      return [{ t: 'circle', cx: 0, cy: 0, r: m * 0.15, tone: -0.4 }];
    case 'vase':
      return [{ t: 'circle', cx: 0, cy: 0, r: m * 0.25, tone: 0.3 }];
    case 'books':
      return [
        { t: 'line', x1: x0, y1: y0 + d / 3, x2: -x0, y2: y0 + d / 3 },
        { t: 'line', x1: x0, y1: y0 + (2 * d) / 3, x2: -x0, y2: y0 + (2 * d) / 3 },
      ];
    case 'art':
    case 'canvas-art':
    case 'mirror':
    case 'round-mirror':
    case 'tv-wall':
      // Seen from above these are thin slabs; mark the face that shows.
      return [{ t: 'line', x1: x0, y1: -y0, x2: -x0, y2: -y0 }];
    case 'shelf':
      return [{ t: 'line', x1: x0, y1: y0 + d * 0.15, x2: -x0, y2: y0 + d * 0.15 }];
    case 'sconce':
      return [{ t: 'circle', cx: 0, cy: d * 0.1, r: Math.min(w, d) * 0.3, tone: 0.3 }];
    case 'chandelier': {
      const r = m * 0.08;
      const ring = m / 2 - r;
      const parts: SymbolPart[] = [{ t: 'circle', cx: 0, cy: 0, r: m * 0.12, tone: -0.2 }];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        parts.push({ t: 'circle', cx: Math.cos(a) * ring, cy: Math.sin(a) * ring, r, tone: 0.35 });
      }
      return parts;
    }
    case 'ceiling-fan': {
      const parts: SymbolPart[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        parts.push({ t: 'line', x1: 0, y1: 0, x2: (Math.cos(a) * m) / 2, y2: (Math.sin(a) * m) / 2 });
      }
      parts.push({ t: 'circle', cx: 0, cy: 0, r: m * 0.1, tone: -0.3 });
      return parts;
    }
    case 'stool':
    case 'round-table':
    case 'ottoman':
    case 'tv':
    case 'box':
    default:
      return [];
  }
}

const ROUND_SHAPES = new Set<FurnitureShape>([
  'round-table',
  'stool',
  'plant',
  'lamp',
  'table-lamp',
  'vase',
  'pendant',
  'chandelier',
  'ceiling-fan',
]);

/** Shapes drawn with an elliptical base outline instead of a rectangle. */
export function isRoundShape(shape: FurnitureShape): boolean {
  return ROUND_SHAPES.has(shape);
}

