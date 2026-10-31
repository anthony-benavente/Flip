import { inject, Injectable } from '@angular/core';
import { ArtImage, isArtImage } from '../model/art-image';
import { CustomModel, isCustomModel } from '../model/custom-model';
import { remapFurnitureArt, remapFurnitureModels } from '../model/plan-operations';
import { newId, Plan } from '../model/plan.model';
import { base64ToBytes, bytesToBase64, sameBytes } from '../shared/base64';
import { ImageLibrary } from './image-library';
import { ModelLibrary } from './model-library';
import { PLAN_REPOSITORY } from './plan-repository';
import { migratePlan, PlanFormatError } from './plan-migration';

export const PLAN_FILE_EXTENSION = '.flip.json';

interface FileMeta {
  id: string;
  name: string;
  byteSize: number;
}

/** A stored upload (model or image) as the libraries hand it out. */
interface FileRecord<M extends FileMeta> {
  meta: M;
  data: ArrayBuffer;
}

/** An uploaded file embedded in an exported plan file. */
interface EmbeddedFile<M extends FileMeta> {
  meta: M;
  /** Base64 of the file. */
  data: string;
}

interface FileLibrary<M extends FileMeta> {
  record(id: string): Promise<FileRecord<M> | null>;
  add(record: FileRecord<M>): Promise<void>;
}

/** How one kind of upload is embedded: its JSON key, a name for messages, and its validator. */
interface EmbeddedKind<M extends FileMeta> {
  key: string;
  label: string;
  idPrefix: string;
  isMeta: (v: unknown) => v is M;
  library: FileLibrary<M>;
}

/**
 * Exports plans as JSON files and imports them back. Uploaded models and art images the plan uses
 * are embedded under optional `models` and `images` keys, so the file is self-contained; older
 * readers ignore the keys.
 */
@Injectable({ providedIn: 'root' })
export class PlanFileService {
  private readonly repo = inject(PLAN_REPOSITORY);
  private readonly models: EmbeddedKind<CustomModel> = {
    key: 'models',
    label: '3D model',
    idPrefix: 'm',
    isMeta: isCustomModel,
    library: inject(ModelLibrary),
  };
  private readonly images: EmbeddedKind<ArtImage> = {
    key: 'images',
    label: 'picture',
    idPrefix: 'i',
    isMeta: isArtImage,
    library: inject(ImageLibrary),
  };

  async export(plan: Plan): Promise<void> {
    const models = await this.embed(this.models, plan.furniture.map((f) => f.modelId));
    const images = await this.embed(this.images, plan.furniture.map((f) => f.artImageId));
    const doc = { ...plan, ...(models.length ? { models } : {}), ...(images.length ? { images } : {}) };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName(plan.name)}${PLAN_FILE_EXTENSION}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Parses a file, saves it as a project with its models and images, and returns it. Keeps the id unless it is taken. */
  async import(file: File): Promise<Plan> {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      throw new PlanFormatError(`${file.name} is not valid JSON.`);
    }
    const { models, images, ...fields } = (json ?? {}) as Record<string, unknown>;
    const plan = migratePlan(json && typeof json === 'object' ? fields : json);
    // Check everything before storing anything.
    const parsedModels = models === undefined ? [] : this.parse(this.models, models);
    const parsedImages = images === undefined ? [] : this.parse(this.images, images);
    remapFurnitureModels(plan, await this.restore(this.models, parsedModels));
    remapFurnitureArt(plan, await this.restore(this.images, parsedImages));
    if (await this.repo.get(plan.id)) plan.id = newId('p');
    await this.repo.save(plan);
    return plan;
  }

  private async embed<M extends FileMeta>(kind: EmbeddedKind<M>, used: (string | undefined)[]): Promise<EmbeddedFile<M>[]> {
    const ids = new Set(used.filter((id): id is string => !!id));
    const records = await Promise.all([...ids].map((id) => kind.library.record(id)));
    return records.flatMap((r) => (r ? [{ meta: r.meta, data: bytesToBase64(r.data) }] : []));
  }

  private parse<M extends FileMeta>(kind: EmbeddedKind<M>, raw: unknown): FileRecord<M>[] {
    if (!Array.isArray(raw)) throw new PlanFormatError(`"${kind.key}" must be a list.`);
    return raw.map((m: Partial<EmbeddedFile<M>> | null) => {
      if (!kind.isMeta(m?.meta) || typeof m.data !== 'string') throw new PlanFormatError(`A ${kind.label} in this file is malformed.`);
      try {
        return { meta: m.meta, data: base64ToBytes(m.data) };
      } catch {
        throw new PlanFormatError(`The ${kind.label} "${m.meta.name}" is damaged.`);
      }
    });
  }

  /**
   * Adds embedded files to their library. One already there with the same bytes is reused; one
   * whose id is taken by different bytes is stored under a new id. Returns old id → new id.
   */
  private async restore<M extends FileMeta>(kind: EmbeddedKind<M>, parsed: FileRecord<M>[]): Promise<Map<string, string>> {
    const renamed = new Map<string, string>();
    for (const { meta, data } of parsed) {
      const existing = await kind.library.record(meta.id);
      if (existing && sameBytes(existing.data, data)) continue;
      const id = existing ? newId(kind.idPrefix) : meta.id;
      if (id !== meta.id) renamed.set(meta.id, id);
      await kind.library.add({ meta: { ...meta, id, byteSize: data.byteLength }, data });
    }
    return renamed;
  }
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'plan';
}
