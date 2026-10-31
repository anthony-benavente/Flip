import { CustomModel, CustomModelRecord, ModelSettings } from '../model/custom-model';
import type { ModelRepository } from './model-repository';

/** Keeps models in memory. Used when IndexedDB is unavailable, and in tests. */
export class MemoryModelRepository implements ModelRepository {
  private readonly records = new Map<string, CustomModelRecord>();

  async list(): Promise<CustomModel[]> {
    return [...this.records.values()].map((r) => ({ ...r.meta }));
  }

  async get(id: string): Promise<CustomModelRecord | null> {
    const r = this.records.get(id);
    return r ? { meta: { ...r.meta }, data: r.data } : null;
  }

  async save(record: CustomModelRecord): Promise<void> {
    this.records.set(record.meta.id, { meta: { ...record.meta }, data: record.data });
  }

  async update(id: string, patch: ModelSettings): Promise<void> {
    const r = this.records.get(id);
    if (r) r.meta = { ...r.meta, ...patch };
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}
