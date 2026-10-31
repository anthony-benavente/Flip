import { CustomModel, CustomModelRecord, ModelSettings } from '../model/custom-model';
import type { ModelRepository } from './model-repository';

const DB_NAME = 'flip-models';
const DB_VERSION = 1;
/** Metadata, keyed by `id`. Listing reads only this store. */
const META = 'meta';
/** File bytes, keyed by model id. */
const BLOBS = 'blobs';

/** Stores uploaded models in IndexedDB: metadata and file bytes in separate object stores. */
export class IndexedDbModelRepository implements ModelRepository {
  private db: Promise<IDBDatabase> | null = null;

  async list(): Promise<CustomModel[]> {
    return this.run(META, 'readonly', (tx) => request<CustomModel[]>(tx.objectStore(META).getAll()));
  }

  async get(id: string): Promise<CustomModelRecord | null> {
    return this.run([META, BLOBS], 'readonly', async (tx) => {
      const [meta, data] = await Promise.all([
        request<CustomModel | undefined>(tx.objectStore(META).get(id)),
        request<ArrayBuffer | undefined>(tx.objectStore(BLOBS).get(id)),
      ]);
      return meta && data ? { meta, data } : null;
    });
  }

  async save(record: CustomModelRecord): Promise<void> {
    await this.run([META, BLOBS], 'readwrite', (tx) => {
      tx.objectStore(META).put(record.meta);
      tx.objectStore(BLOBS).put(record.data, record.meta.id);
    });
  }

  async update(id: string, patch: ModelSettings): Promise<void> {
    await this.run(META, 'readwrite', async (tx) => {
      const store = tx.objectStore(META);
      const meta = await request<CustomModel | undefined>(store.get(id));
      if (meta) store.put({ ...meta, ...patch });
    });
  }

  async delete(id: string): Promise<void> {
    await this.run([META, BLOBS], 'readwrite', (tx) => {
      tx.objectStore(META).delete(id);
      tx.objectStore(BLOBS).delete(id);
    });
  }

  /** Runs `work` in a transaction and resolves with its result once the transaction completes. */
  private async run<T>(stores: string | string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => T | Promise<T>): Promise<T> {
    const db = await this.open();
    const tx = db.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Model storage transaction aborted.'));
    });
    const result = await work(tx);
    await done;
    return result;
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
