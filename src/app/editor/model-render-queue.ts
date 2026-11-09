import { DestroyRef, effect, inject, Injectable, InjectionToken } from '@angular/core';
import { catalogItem } from '../model/catalog';
import { CustomModel } from '../model/custom-model';
import { currentRenderKey, ModelLibrary } from '../persistence/model-library';
import type { ModelPictureRequest, ModelPictures } from '../preview3d/model-render';

export type ModelPictureRenderer = (request: ModelPictureRequest) => Promise<ModelPictures>;

/** Draws a model's pictures. The default loads three.js on first use, so it stays out of the main bundle. */
export const MODEL_PICTURE_RENDERER = new InjectionToken<ModelPictureRenderer>('MODEL_PICTURE_RENDERER', {
  providedIn: 'root',
  factory: () => async (request) => (await import('../preview3d/model-render')).renderModelPictures(request),
});

/**
 * Keeps every uploaded model's pictures (plan top view and thumbnail) up to date: whenever the
 * library has a model whose pictures are missing or were drawn from other settings, after an
 * upload, an edit, an import or for models uploaded before pictures existed, it renders them one
 * model at a time and stores them. Provided by the editor page.
 */
@Injectable()
export class ModelRenderQueue {
  private readonly library = inject(ModelLibrary);
  private readonly render = inject(MODEL_PICTURE_RENDERER);
  /** Model id plus render key of every attempt, so a model that fails is not retried until it changes. */
  private readonly tried = new Set<string>();
  private running = false;
  private stopped = false;
  /** Settles when the current run has finished; for tests. */
  idle: Promise<void> = Promise.resolve();

  constructor() {
    effect(() => {
      if (this.library.staleRenders().length && !this.running && !this.stopped) this.idle = this.drain();
    });
    inject(DestroyRef).onDestroy(() => (this.stopped = true));
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (!this.stopped) {
        const model = this.library.staleRenders().find((m) => !this.tried.has(attempt(m)));
        if (!model) return;
        this.tried.add(attempt(model));
        if (!(await this.renderOne(model))) return;
      }
    } finally {
      this.running = false;
    }
  }

  /** Returns false when rendering cannot work at all in this browser. */
  private async renderOne(model: CustomModel): Promise<boolean> {
    const key = currentRenderKey(model);
    try {
      const data = await this.library.bytes(model.id);
      if (!data) return true;
      const c = catalogItem(model.catalogId);
      const pictures = await this.render({
        data,
        orientation: model.orientation,
        trim: model.trim,
        colors: model.colors,
        width: c.width,
        depth: c.depth,
        height: c.height,
      });
      await this.library.saveRenders(model.id, { key, ...pictures });
      return true;
    } catch (e) {
      const noWebGl = e instanceof Error && e.name === 'WebGLUnavailable';
      console.warn(noWebGl ? 'Model pictures are off: this browser could not start WebGL.' : `Could not draw pictures of the model "${model.name}".`, e);
      if (noWebGl) this.stopped = true;
      return !noWebGl;
    }
  }
}

function attempt(model: CustomModel): string {
  return `${model.id} ${currentRenderKey(model)}`;
}
