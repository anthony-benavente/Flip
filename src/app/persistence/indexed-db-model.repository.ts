import { CustomModel, CustomModelRecord, ModelSettings } from '../model/custom-model';
import { BLOBS, FileDatabase, META, request } from './idb';
import type { ModelRepository } from './model-repository';

/** Stores uploaded models in IndexedDB: metadata and file bytes in separate object stores. */
export class IndexedDbModelRepository implements ModelRepository {
  private readonly db = new FileDatabase('flip-models', 'Model');

  async list(): Promise<CustomModel[]> {
    return this.db.run(META, 'readonly', (tx) => request<CustomModel[]>(tx.objectStore(META).getAll()));
  }

  async get(id: string): Promise<CustomModelRecord | null> {
    return this.db.run([META, BLOBS], 'readonly', async (tx) => {
      const [meta, data] = await Promise.all([
        request<CustomModel | undefined>(tx.objectStore(META).get(id)),
        request<ArrayBuffer | undefined>(tx.objectStore(BLOBS).get(id)),
      ]);
      return meta && data ? { meta, data } : null;
    });
  }

  async save(record: CustomModelRecord): Promise<void> {
    await this.db.run([META, BLOBS], 'readwrite', (tx) => {
      tx.objectStore(META).put(record.meta);
      tx.objectStore(BLOBS).put(record.data, record.meta.id);
    });
  }

  async update(id: string, patch: ModelSettings): Promise<void> {
    await this.db.run(META, 'readwrite', async (tx) => {
      const store = tx.objectStore(META);
      const meta = await request<CustomModel | undefined>(store.get(id));
      if (meta) store.put({ ...meta, ...patch });
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.run([META, BLOBS], 'readwrite', (tx) => {
      tx.objectStore(META).delete(id);
      tx.objectStore(BLOBS).delete(id);
    });
  }
}
