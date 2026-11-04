/** User-uploaded 3D models (glTF / GLB) that replace a catalog template's built-in 3D look. */
import { CatalogItem } from './catalog';

export type QuarterTurns = 0 | 1 | 2 | 3;

/** Quarter turns about each axis, applied in X, Y, Z order before fitting, to fix a model's up axis or facing. */
export interface ModelOrientation {
  x: QuarterTurns;
  y: QuarterTurns;
  z: QuarterTurns;
}

export const DEFAULT_ORIENTATION: ModelOrientation = { x: 0, y: 0, z: 0 };

/**
 * Fractions of the model's measured size cut off each side before it is stretched to the item's
 * box, for files whose bounds hold empty space or stray parts. Sides are those of the item after
 * `orientation`: front faces +z, and left and right are as seen from the front.
 */
export interface ModelTrim {
  left: number;
  right: number;
  front: number;
  back: number;
  top: number;
  bottom: number;
}

export type TrimSide = keyof ModelTrim;
export const TRIM_SIDES: readonly TrimSide[] = ['left', 'right', 'front', 'back', 'top', 'bottom'];
/** Largest trim on one side, so opposite sides together always keep 10% of the model. */
export const MAX_TRIM = 0.45;
export const NO_TRIM: ModelTrim = { left: 0, right: 0, front: 0, back: 0, top: 0, bottom: 0 };

export interface CustomModel {
  id: string;
  name: string;
  /** The catalog template the model stands in for. Placed items take its size, 2D symbol and snapping. */
  catalogId: string;
  fileName: string;
  byteSize: number;
  createdAt: string;
  orientation: ModelOrientation;
  /** Unset when nothing is trimmed. */
  trim?: ModelTrim;
}

/** What can change after upload: everything but the file. */
export type ModelSettings = Partial<Pick<CustomModel, 'name' | 'catalogId' | 'orientation' | 'trim'>>;

/** A model's metadata plus its glTF / GLB file bytes. */
export interface CustomModelRecord {
  meta: CustomModel;
  data: ArrayBuffer;
}

export const MODEL_FILE_ACCEPT = '.glb,.gltf';
export const MAX_MODEL_BYTES = 25 * 1024 * 1024;

/** "Office chair · Aeron". */
export function modelDisplayName(model: Pick<CustomModel, 'name'>, template: Pick<CatalogItem, 'name'>): string {
  return `${template.name} · ${model.name}`;
}

/** "840 KB", "3.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A default model name from a file name: "aeron_chair.glb" → "aeron chair". */
export function modelNameFromFile(fileName: string): string {
  return fileName.replace(/\.(glb|gltf)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Model';
}

/** Adds one quarter turn about an axis. */
export function turnOrientation(o: ModelOrientation, axis: keyof ModelOrientation): ModelOrientation {
  return { ...o, [axis]: ((o[axis] + 1) % 4) as QuarterTurns };
}

/** Sets one side's trim, clamped to 0…`MAX_TRIM` and rounded to 0.1%. */
export function setTrimSide(trim: ModelTrim, side: TrimSide, value: number): ModelTrim {
  const clamped = Math.min(MAX_TRIM, Math.max(0, Number.isFinite(value) ? value : 0));
  return { ...trim, [side]: Math.round(clamped * 1000) / 1000 };
}

/** The trim to store on a model: `undefined` when no side is trimmed. */
export function storedTrim(trim: ModelTrim): ModelTrim | undefined {
  return TRIM_SIDES.some((s) => trim[s] > 0) ? { ...trim } : undefined;
}

export function isModelTrim(v: unknown): v is ModelTrim {
  if (!v || typeof v !== 'object') return false;
  return TRIM_SIDES.every((s) => {
    const n = (v as Record<string, unknown>)[s];
    return typeof n === 'number' && n >= 0 && n <= MAX_TRIM;
  });
}

export function isModelOrientation(v: unknown): v is ModelOrientation {
  const turn = (t: unknown) => t === 0 || t === 1 || t === 2 || t === 3;
  return !!v && typeof v === 'object' && ['x', 'y', 'z'].every((k) => turn((v as Record<string, unknown>)[k]));
}

/** Validates model metadata read from a file or storage. */
export function isCustomModel(v: unknown): v is CustomModel {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    ['id', 'name', 'catalogId', 'fileName', 'createdAt'].every((k) => typeof m[k] === 'string') &&
    typeof m['byteSize'] === 'number' &&
    isModelOrientation(m['orientation']) &&
    (m['trim'] === undefined || isModelTrim(m['trim']))
  );
}
