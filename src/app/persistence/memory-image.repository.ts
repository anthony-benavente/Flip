import { ArtImage, ArtImageRecord } from '../model/art-image';
import type { ImageRepository } from './image-repository';

/** Keeps images in memory. Used when IndexedDB is unavailable, and in tests. */
export class MemoryImageRepository implements ImageRepository {
  private readonly records = new Map<string, ArtImageRecord>();

  async list(): Promise<ArtImage[]> {
    return [...this.records.values()].map((r) => ({ ...r.meta }));
  }

  async get(id: string): Promise<ArtImageRecord | null> {
    const r = this.records.get(id);
    return r ? { meta: { ...r.meta }, data: r.data } : null;
  }

  async save(record: ArtImageRecord): Promise<void> {
    this.records.set(record.meta.id, { meta: { ...record.meta }, data: record.data });
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}
