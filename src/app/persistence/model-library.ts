import { computed, inject, Injectable, signal } from '@angular/core';
import {
  CustomModel,
  CustomModelRecord,
  MAX_MODEL_BYTES,
  ModelColors,
  ModelOrientation,
  ModelSettings,
  ModelTrim,
} from '../model/custom-model';
import { newId } from '../model/plan.model';
import { MODEL_REPOSITORY } from './model-repository';

/**
 * The user's uploaded 3D models: a signal of their metadata for the UI, plus cached file bytes
 * for the 3D view. Never imports three.js.
 */
@Injectable({ providedIn: 'root' })
export class ModelLibrary {
  private readonly repo = inject(MODEL_REPOSITORY);
  private readonly list = signal<CustomModel[]>([]);
  private readonly bytesCache = new Map<string, Promise<ArrayBuffer | null>>();

  /** All models, oldest first. */
  readonly models = this.list.asReadonly();
  private readonly byId = computed(() => new Map(this.list().map((m) => [m.id, m])));
  /** Resolves once the first listing has loaded. */
  readonly ready: Promise<void> = this.refresh();

  model(id: string | undefined): CustomModel | undefined {
    return id ? this.byId().get(id) : undefined;
  }

  forTemplate(catalogId: string): CustomModel[] {
    return this.list().filter((m) => m.catalogId === catalogId);
  }

  /** Reloads the listing from storage. */
  async refresh(): Promise<void> {
    try {
      const models = await this.repo.list();
      this.list.set(models.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    } catch (e) {
      console.warn('Could not read the 3D model library.', e);
    }
  }

  /** Adds a model file as a variant of a catalog template. */
  async upload(
    file: File,
    catalogId: string,
    name: string,
    orientation: ModelOrientation,
    trim?: ModelTrim,
    colors?: ModelColors,
  ): Promise<CustomModel> {
    if (file.size > MAX_MODEL_BYTES) throw new Error(`${file.name} is larger than ${MAX_MODEL_BYTES / 1024 / 1024} MB.`);
    const meta: CustomModel = {
      id: newId('m'),
      name: name.trim() || 'Model',
      catalogId,
      fileName: file.name,
      byteSize: file.size,
      createdAt: new Date().toISOString(),
      orientation,
      ...(trim && { trim }),
      ...(colors && { colors }),
    };
    await this.add({ meta, data: await file.arrayBuffer() });
    return meta;
  }

  /** Stores a model record as is (for imports), replacing any model with the same id. */
  async add(record: CustomModelRecord): Promise<void> {
    await this.repo.save(record);
    this.bytesCache.set(record.meta.id, Promise.resolve(record.data));
    this.list.update((l) => [...l.filter((m) => m.id !== record.meta.id), { ...record.meta }]);
  }

  /** The full record, read from storage. */
  record(id: string): Promise<CustomModelRecord | null> {
    return this.repo.get(id);
  }

  /** Changes a model's name, template, orientation, trim or colors. A blank name is ignored. */
  async update(id: string, settings: ModelSettings): Promise<void> {
    const patch = { ...settings };
    if (patch.name !== undefined) patch.name = patch.name.trim() || undefined;
    if (!patch.name) delete patch.name;
    await this.repo.update(id, patch);
    this.list.update((l) => l.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  /** Deletes a model. Furniture that used it falls back to the built-in model. */
  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
    this.bytesCache.delete(id);
    this.list.update((l) => l.filter((m) => m.id !== id));
  }

  /** A model's file bytes, read once and cached; `null` when the model is gone. */
  bytes(id: string): Promise<ArrayBuffer | null> {
    let p = this.bytesCache.get(id);
    if (!p) {
      p = this.repo.get(id).then((r) => r?.data ?? null);
      this.bytesCache.set(id, p);
      p.then((data) => data ?? this.bytesCache.delete(id), () => this.bytesCache.delete(id));
    }
    return p;
  }
}
