import { computed, inject, Injectable, signal } from '@angular/core';
import { catalogItem } from '../model/catalog';
import {
  CustomModel,
  CustomModelRecord,
  MAX_MODEL_BYTES,
  ModelColors,
  ModelOrientation,
  ModelRenders,
  modelRenderKey,
  ModelSettings,
  ModelTrim,
} from '../model/custom-model';
import { newId } from '../model/plan.model';
import { MODEL_REPOSITORY } from './model-repository';

/** Object URLs of a model's stored pictures. */
interface RenderUrls {
  key: string;
  top: string;
  thumb: string;
}

/** The key a model's pictures must have to be current. */
export function currentRenderKey(model: CustomModel): string {
  return modelRenderKey(model, catalogItem(model.catalogId));
}

/**
 * The user's uploaded 3D models: a signal of their metadata for the UI, cached file bytes for
 * the 3D view, and object URLs of their rendered pictures (top view and thumbnail). Never imports
 * three.js; the pictures are drawn by `ModelRenderQueue` in the editor.
 */
@Injectable({ providedIn: 'root' })
export class ModelLibrary {
  private readonly repo = inject(MODEL_REPOSITORY);
  private readonly list = signal<CustomModel[]>([]);
  private readonly bytesCache = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly renders = signal<ReadonlyMap<string, RenderUrls>>(new Map());
  /** False until stored pictures have been listed, so nothing looks out of date before then. */
  private readonly rendersLoaded = signal(false);

  /** All models, oldest first. */
  readonly models = this.list.asReadonly();
  private readonly byId = computed(() => new Map(this.list().map((m) => [m.id, m])));
  /** Models whose pictures are missing or out of date, oldest first. */
  readonly staleRenders = computed(() => {
    if (!this.rendersLoaded()) return [];
    const renders = this.renders();
    return this.list().filter((m) => renders.get(m.id)?.key !== currentRenderKey(m));
  });
  /** Resolves once the first listing has loaded. */
  readonly ready: Promise<void> = this.refresh();

  model(id: string | undefined): CustomModel | undefined {
    return id ? this.byId().get(id) : undefined;
  }

  forTemplate(catalogId: string): CustomModel[] {
    return this.list().filter((m) => m.catalogId === catalogId);
  }

  /** Reloads the listing and the stored pictures from storage. */
  async refresh(): Promise<void> {
    try {
      const models = await this.repo.list();
      this.list.set(models.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    } catch (e) {
      console.warn('Could not read the 3D model library.', e);
      return;
    }
    try {
      const stored = await this.repo.listRenders();
      const next = new Map<string, RenderUrls>();
      for (const [id, r] of stored) {
        const urls = toUrls(r);
        if (urls) next.set(id, urls);
      }
      this.replaceRenders(next);
    } catch (e) {
      console.warn('Could not read the 3D model pictures.', e);
    }
    this.rendersLoaded.set(true);
  }

  /**
   * An object URL of the model's top view for the 2D plan, or `undefined` when the model is gone,
   * asks for the template's symbol, or its picture is missing or out of date.
   */
  topView(id: string | undefined): string | undefined {
    const model = this.model(id);
    return model && !model.planSymbol ? this.current(model)?.top : undefined;
  }

  /** An object URL of the model's three-quarter thumbnail, or `undefined` as for `topView`. */
  thumbnail(id: string | undefined): string | undefined {
    const model = this.model(id);
    return model ? this.current(model)?.thumb : undefined;
  }

  /** Stores freshly rendered pictures of a model. Ignored when the model has been deleted. */
  async saveRenders(id: string, renders: ModelRenders): Promise<void> {
    await this.repo.saveRenders(id, renders);
    const urls = this.model(id) ? toUrls(renders) : null;
    if (urls) this.replaceRenders(new Map(this.renders()).set(id, urls));
  }

  /** Adds a model file as a variant of a catalog template. */
  async upload(
    file: File,
    catalogId: string,
    name: string,
    orientation: ModelOrientation,
    trim?: ModelTrim,
    colors?: ModelColors,
    planSymbol?: boolean,
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
      ...(planSymbol && { planSymbol }),
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

  /** Changes a model's name, template, orientation, trim, colors or plan drawing. A blank name is ignored. */
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
    this.replaceRenders(new Map([...this.renders()].filter(([k]) => k !== id)));
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

  private current(model: CustomModel): RenderUrls | undefined {
    const r = this.renders().get(model.id);
    return r && r.key === currentRenderKey(model) ? r : undefined;
  }

  /** Swaps in a new set of picture URLs and revokes the ones no longer used. */
  private replaceRenders(next: ReadonlyMap<string, RenderUrls>): void {
    const kept = new Set([...next.values()].flatMap((r) => [r.top, r.thumb]));
    for (const r of this.renders().values()) {
      for (const url of [r.top, r.thumb]) if (!kept.has(url)) URL.revokeObjectURL(url);
    }
    this.renders.set(next);
  }
}

function toUrls(r: ModelRenders): RenderUrls | null {
  if (typeof URL.createObjectURL !== 'function') return null;
  return { key: r.key, top: URL.createObjectURL(r.top), thumb: URL.createObjectURL(r.thumb) };
}
