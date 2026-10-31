import { ArtImage, ArtImageRecord } from '../model/art-image';
import { BLOBS, FileDatabase, META, request } from './idb';
import type { ImageRepository } from './image-repository';

/** Stores uploaded art images in their own IndexedDB database, metadata apart from bytes. */
export class IndexedDbImageRepository implements ImageRepository {
  private readonly db = new FileDatabase('flip-images', 'Image');

  async list(): Promise<ArtImage[]> {
    return this.db.run(META, 'readonly', (tx) => request<ArtImage[]>(tx.objectStore(META).getAll()));
  }

  async get(id: string): Promise<ArtImageRecord | null> {
    return this.db.run([META, BLOBS], 'readonly', async (tx) => {
      const [meta, data] = await Promise.all([
        request<ArtImage | undefined>(tx.objectStore(META).get(id)),
        request<ArrayBuffer | undefined>(tx.objectStore(BLOBS).get(id)),
      ]);
      return meta && data ? { meta, data } : null;
    });
  }

  async save(record: ArtImageRecord): Promise<void> {
    await this.db.run([META, BLOBS], 'readwrite', (tx) => {
      tx.objectStore(META).put(record.meta);
      tx.objectStore(BLOBS).put(record.data, record.meta.id);
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.run([META, BLOBS], 'readwrite', (tx) => {
      tx.objectStore(META).delete(id);
      tx.objectStore(BLOBS).delete(id);
    });
  }
}
