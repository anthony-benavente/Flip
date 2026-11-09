/** Metadata, keyed by `id`. Listing reads only this store. */
export const META = 'meta';
/** File bytes, keyed by the same id as their metadata. */
export const BLOBS = 'blobs';

/**
 * A lazily opened IndexedDB database holding uploaded files: metadata in `META` and bytes in
 * `BLOBS`, so lists never load file contents. Shared by the model and image repositories.
 */
export class FileDatabase {
  private db: Promise<IDBDatabase> | null = null;

  /**
   * `what` names the contents in error messages, e.g. "Model". `extraStores` are further
   * out-of-line-key stores; raise `version` whenever one is added so existing databases upgrade.
   */
  constructor(
    private readonly name: string,
    private readonly what: string,
    private readonly version = 1,
    private readonly extraStores: readonly string[] = [],
  ) {}

  /** Runs `work` in a transaction and resolves with its result once the transaction completes. */
  async run<T>(stores: string | string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => T | Promise<T>): Promise<T> {
    const db = await this.open();
    const tx = db.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error(`${this.what} storage transaction aborted.`));
    });
    const result = await work(tx);
    await done;
    return result;
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
        for (const store of [BLOBS, ...this.extraStores]) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }
}

export function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
