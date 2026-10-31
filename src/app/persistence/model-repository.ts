import { InjectionToken } from '@angular/core';
import { CustomModel, CustomModelRecord, ModelSettings } from '../model/custom-model';
import { IndexedDbModelRepository } from './indexed-db-model.repository';
import { MemoryModelRepository } from './memory-model.repository';

/**
 * Storage for uploaded 3D models. Model files are too large for localStorage, so the browser
 * implementation uses IndexedDB; a server-backed one (for user accounts) can be swapped in via
 * the MODEL_REPOSITORY token.
 */
export interface ModelRepository {
  /** Metadata only; file bytes are read one model at a time with `get`. */
  list(): Promise<CustomModel[]>;
  get(id: string): Promise<CustomModelRecord | null>;
  save(record: CustomModelRecord): Promise<void>;
  /** Changes a model's settings; the file stays the same. */
  update(id: string, patch: ModelSettings): Promise<void>;
  delete(id: string): Promise<void>;
}

/** IndexedDB when the browser has it, otherwise an in-memory library that lasts for the session. */
export function defaultModelRepository(): ModelRepository {
  return typeof indexedDB !== 'undefined' ? new IndexedDbModelRepository() : new MemoryModelRepository();
}

export const MODEL_REPOSITORY = new InjectionToken<ModelRepository>('MODEL_REPOSITORY', {
  providedIn: 'root',
  factory: defaultModelRepository,
});
