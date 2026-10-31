import { inject, Injectable } from '@angular/core';
import { CustomModel, isCustomModel } from '../model/custom-model';
import { remapFurnitureModels } from '../model/plan-operations';
import { newId, Plan } from '../model/plan.model';
import { base64ToBytes, bytesToBase64, sameBytes } from '../shared/base64';
import { ModelLibrary } from './model-library';
import { PLAN_REPOSITORY } from './plan-repository';
import { migratePlan, PlanFormatError } from './plan-migration';

export const PLAN_FILE_EXTENSION = '.flip.json';

/** An uploaded model embedded in an exported plan file. */
interface EmbeddedModel {
  meta: CustomModel;
  /** Base64 of the glTF / GLB file. */
  data: string;
}

/**
 * Exports plans as JSON files and imports them back. Uploaded models the plan uses are embedded
 * under an optional `models` key, so the file is self-contained; older readers ignore the key.
 */
@Injectable({ providedIn: 'root' })
export class PlanFileService {
  private readonly repo = inject(PLAN_REPOSITORY);
  private readonly models = inject(ModelLibrary);

  async export(plan: Plan): Promise<void> {
    const models = await this.embedModels(plan);
    const doc = models.length ? { ...plan, models } : plan;
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

  /** Parses a file, saves it as a project with its models, and returns it. Keeps the id unless it is taken. */
  async import(file: File): Promise<Plan> {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      throw new PlanFormatError(`${file.name} is not valid JSON.`);
    }
    const { models, ...fields } = (json ?? {}) as Record<string, unknown>;
    const plan = migratePlan(json && typeof json === 'object' ? fields : json);
    if (models !== undefined) remapFurnitureModels(plan, await this.restoreModels(models));
    if (await this.repo.get(plan.id)) plan.id = newId('p');
    await this.repo.save(plan);
    return plan;
  }

  private async embedModels(plan: Plan): Promise<EmbeddedModel[]> {
    const ids = new Set(plan.furniture.flatMap((f) => (f.modelId ? [f.modelId] : [])));
    const records = await Promise.all([...ids].map((id) => this.models.record(id)));
    return records.flatMap((r) => (r ? [{ meta: r.meta, data: bytesToBase64(r.data) }] : []));
  }

  /**
   * Adds embedded models to the library. A model already there with the same bytes is reused; one
   * whose id is taken by different bytes is stored under a new id. Returns old id → new id.
   */
  private async restoreModels(raw: unknown): Promise<Map<string, string>> {
    if (!Array.isArray(raw)) throw new PlanFormatError('"models" must be a list.');
    const parsed = raw.map((m: Partial<EmbeddedModel> | null) => {
      if (!isCustomModel(m?.meta) || typeof m.data !== 'string') throw new PlanFormatError('A 3D model in this file is malformed.');
      try {
        return { meta: m.meta, data: base64ToBytes(m.data) };
      } catch {
        throw new PlanFormatError(`The 3D model "${m.meta.name}" is damaged.`);
      }
    });
    const renamed = new Map<string, string>();
    for (const { meta, data } of parsed) {
      const existing = await this.models.record(meta.id);
      if (existing && sameBytes(existing.data, data)) continue;
      const id = existing ? newId('m') : meta.id;
      if (id !== meta.id) renamed.set(meta.id, id);
      await this.models.add({ meta: { ...meta, id, byteSize: data.byteLength }, data });
    }
    return renamed;
  }
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'plan';
}
