import { InjectionToken } from '@angular/core';
import { ArtImage, ArtImageRecord } from '../model/art-image';
import { IndexedDbImageRepository } from './indexed-db-image.repository';
import { MemoryImageRepository } from './memory-image.repository';

/**
 * Storage for uploaded art images. Like models, they live outside the plan (IndexedDB in the
 * browser) and a server-backed implementation can be swapped in via the IMAGE_REPOSITORY token.
 */
export interface ImageRepository {
  /** Metadata only; file bytes are read one image at a time with `get`. */
  list(): Promise<ArtImage[]>;
  get(id: string): Promise<ArtImageRecord | null>;
  save(record: ArtImageRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

/** IndexedDB when the browser has it, otherwise an in-memory library that lasts for the session. */
export function defaultImageRepository(): ImageRepository {
  return typeof indexedDB !== 'undefined' ? new IndexedDbImageRepository() : new MemoryImageRepository();
}

export const IMAGE_REPOSITORY = new InjectionToken<ImageRepository>('IMAGE_REPOSITORY', {
  providedIn: 'root',
  factory: defaultImageRepository,
});
