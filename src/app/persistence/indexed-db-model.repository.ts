import { CustomModel, CustomModelRecord, ModelRenders, ModelSettings } from '../model/custom-model';
import { BLOBS, FileDatabase, META, request } from './idb';
import type { ModelRepository } from './model-repository';

/** Rendered pictures of each model, keyed by model id. Added in database version 2. */
const RENDERS = 'renders';

/** Stores uploaded models in IndexedDB: metadata, file bytes and pictures in separate object stores. */
export class IndexedDbModelRepository implements ModelRepository {
  private readonly db = new FileDatabase('flip-models', 'Model', 2, [RENDERS]);

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
    await this.db.run([META, BLOBS, RENDERS], 'readwrite', (tx) => {
      tx.objectStore(META).delete(id);
      tx.objectStore(BLOBS).delete(id);
      tx.objectStore(RENDERS).delete(id);
    });
  }

  async listRenders(): Promise<Map<string, ModelRenders>> {
    return this.db.run(RENDERS, 'readonly', async (tx) => {
      const store = tx.objectStore(RENDERS);
      const [keys, values] = await Promise.all([request<IDBValidKey[]>(store.getAllKeys()), request<ModelRenders[]>(store.getAll())]);
      return new Map(keys.map((k, i) => [String(k), values[i]]));
    });
  }

  async saveRenders(id: string, renders: ModelRenders): Promise<void> {
    await this.db.run([META, RENDERS], 'readwrite', async (tx) => {
      const meta = await request<CustomModel | undefined>(tx.objectStore(META).get(id));
      if (meta) tx.objectStore(RENDERS).put(renders, id);
    });
  }
}
