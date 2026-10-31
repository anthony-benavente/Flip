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

export interface CustomModel {
  id: string;
  name: string;
  /** The catalog template the model stands in for. Placed items take its size, 2D symbol and snapping. */
  catalogId: string;
  fileName: string;
  byteSize: number;
  createdAt: string;
  orientation: ModelOrientation;
}

/** What can change after upload: everything but the file. */
export type ModelSettings = Partial<Pick<CustomModel, 'name' | 'catalogId' | 'orientation'>>;

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
    isModelOrientation(m['orientation'])
  );
}
