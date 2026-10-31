/**
 * Procedural floor patterns as grayscale RGBA pixels. They tile seamlessly and are tinted by the
 * room's floor color (white keeps the color, darker pixels shade it), so one pattern serves every
 * color. Pure and renderer-free; `FurnitureMeshFactory` turns them into textures.
 */
import { FloorMaterial } from '../model/plan.model';

export interface FloorPattern {
  /** Width and height in pixels. */
  size: number;
  /** Floor distance covered by one copy of the pattern, in meters. */
  meters: number;
  /** RGBA, row by row. */
  data: Uint8Array;
}

/** The pattern for a floor material, or null for a plain floor. */
export function floorPattern(material: FloorMaterial): FloorPattern | null {
  switch (material) {
    case 'wood':
      return render(256, 1.6, wood());
    case 'tile':
      return render(128, 0.6, tile);
    case 'carpet':
      return render(128, 0.5, carpet());
    case 'concrete':
      return render(256, 2, concrete());
    default:
      return null;
  }
}

/** Brightness 0..1 at pixel (x, y) of a size×size tile. */
type Shade = (x: number, y: number, size: number) => number;

function render(size: number, meters: number, shade: Shade): FloorPattern {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(Math.min(1, Math.max(0, shade(x, y, size))) * 255);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { size, meters, data };
}

/** Deterministic pseudo-random numbers, so patterns look the same on every build. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Planks running along x: eight per tile, each with its own tone, staggered end joints and grain. */
function wood(): Shade {
  const rand = random(7);
  const rows = 8;
  const planks = Array.from({ length: rows }, () => ({ offset: rand(), tone: rand() * 0.12, phase: rand() * Math.PI * 2 }));
  return (x, y, size) => {
    const rowH = size / rows;
    const row = Math.floor(y / rowH);
    const p = planks[row];
    const inRow = y - row * rowH;
    // End joints once per tile, at a different place in each row.
    const along = (x / size + p.offset) % 1;
    if (inRow < 1 || along * size < 1) return 0.62;
    const grain = Math.sin((y / size) * Math.PI * 2 * 24 + Math.sin((x / size) * Math.PI * 2 * 3 + p.phase) * 2.5) * 0.04;
    return 0.98 - p.tone + grain;
  };
}

/** Square tiles, two by two, with grout lines. */
const tile: Shade = (x, y, size) => {
  const half = size / 2;
  const grout = 2;
  if (x % half < grout || y % half < grout) return 0.72;
  return 0.97 - (((x * 7 + y * 13) % 5) / 5) * 0.03;
};

/** Fine speckle. */
function carpet(): Shade {
  const rand = random(11);
  const cache = new Map<number, number>();
  return (x, y) => {
    const k = y * 4096 + x;
    if (!cache.has(k)) cache.set(k, 0.86 + rand() * 0.14);
    return cache.get(k)!;
  };
}

/** Soft mottling from smoothed value noise on a wrapping lattice. */
function concrete(): Shade {
  const rand = random(23);
  const cells = 8;
  const lattice = Array.from({ length: cells * cells }, () => rand());
  const at = (i: number, j: number) => lattice[((j + cells) % cells) * cells + ((i + cells) % cells)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y, size) => {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = smooth(fx - i);
    const v = smooth(fy - j);
    const top = at(i, j) * (1 - u) + at(i + 1, j) * u;
    const bottom = at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u;
    const n = top * (1 - v) + bottom * v;
    return 0.86 + n * 0.12 + (((x * 31 + y * 17) % 7) / 7) * 0.02;
  };
}
