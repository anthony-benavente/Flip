import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { formatLength } from '../../geometry/units';
import { CATALOG, CATALOG_CATEGORIES, catalogItem } from '../../model/catalog';
import {
  CustomModel,
  DEFAULT_ORIENTATION,
  MAX_MODEL_BYTES,
  MODEL_FILE_ACCEPT,
  ModelOrientation,
  modelNameFromFile,
  turnOrientation,
} from '../../model/custom-model';
import { ModelLibrary } from '../../persistence/model-library';
import { focusWhileOpen } from '../../shared/dom';
import { Icon } from '../../shared/icon';
import { PlanStore } from '../../state/plan.store';
import type { ModelPreview } from '../../preview3d/model-preview';

type PreviewModule = typeof import('../../preview3d/model-preview');

/**
 * Uploads a glTF / GLB model as a variant of a catalog template, or edits an uploaded model's
 * settings (everything but the file). The model is stretched to the template's box; the preview
 * shows the fit so the user can turn the model to face the right way.
 */
@Component({
  selector: 'app-model-upload-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (click)="close()">
      <div #modal class="modal" role="dialog" tabindex="-1" [attr.aria-label]="title()" (click)="$event.stopPropagation()" (keydown)="onKeyDown($event)">
        <div class="modal-head">
          <h2>{{ title() }}</h2>
          <button class="btn ghost icon" aria-label="Close" (click)="close()"><app-icon name="close" /></button>
        </div>
        @if (editing(); as m) {
          <p class="hint">File: {{ m.fileName }}. Changes apply everywhere this model is used.</p>
        } @else {
          <p class="hint">
            Use a .glb file, or a .gltf file with everything embedded. The model is stretched to the size of the furniture it
            stands in for, and you can still resize it on the plan.
          </p>
          <label class="field">
            <span>Model file</span>
            <input class="input" type="file" [accept]="accept" (change)="onFile($event)" aria-label="Model file" />
          </label>
        }
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        <div class="row">
          <label class="field">
            <span>Use as</span>
            <select class="input" [value]="catalogId()" (change)="catalogId.set($any($event.target).value)" aria-label="Use as">
              @for (g of templateGroups; track g.category) {
                <optgroup [label]="g.category">
                  @for (c of g.items; track c.id) {
                    <option [value]="c.id" [selected]="c.id === catalogId()">{{ c.name }}</option>
                  }
                </optgroup>
              }
            </select>
          </label>
          <label class="field">
            <span>Name</span>
            <input class="input" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="e.g. Aeron" aria-label="Model name" />
          </label>
        </div>

        <div class="preview" [class.empty]="status() !== 'ready'">
          <div #host class="host"></div>
          @switch (status()) {
            @case ('idle') { <span class="note">Choose a file to preview it.</span> }
            @case ('reading') { <span class="note">Reading model…</span> }
          }
          @if (status() === 'ready' && previewFailed()) {
            <span class="note">Preview needs WebGL; the model can still be saved.</span>
          }
          <span class="size">{{ sizeText() }}</span>
        </div>

        <div class="turns">
          <span>Turn 90°</span>
          @for (axis of axes; track axis) {
            <button class="btn" [disabled]="status() !== 'ready'" (click)="turn(axis)" [title]="'Turn 90° about ' + axis.toUpperCase()">
              <app-icon name="rotate" /> {{ axis.toUpperCase() }}
            </button>
          }
          <button class="btn ghost" [disabled]="status() !== 'ready'" (click)="orientation.set(defaultOrientation)">Reset</button>
          <span class="front">Red arrow = front</span>
        </div>

        <div class="actions">
          <button class="btn ghost" (click)="close()">Cancel</button>
          <button class="btn primary" [disabled]="status() !== 'ready' || saving()" (click)="save()">
            {{ saving() ? 'Saving…' : editing() ? 'Save changes' : 'Add to furniture' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { width: min(560px, calc(100vw - 32px)); }
    .hint { margin: 6px 0 14px; color: var(--text-muted); font-size: 13px; }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .field > span, .turns > span { color: var(--text-muted); font-size: 12px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .error { margin: -4px 0 12px; color: var(--danger); font-size: 13px; }
    .preview { position: relative; height: 260px; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden;
      background: #eef0f2; }
    .preview.empty .host { visibility: hidden; }
    .host { position: absolute; inset: 0; }
    .note { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px;
      color: var(--text-muted); text-align: center; }
    .size { position: absolute; right: 8px; bottom: 6px; color: var(--text-muted); font-size: 12px; }
    .turns { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; }
    .front { margin-left: auto; color: #d9534f; font-size: 12px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
  `,
})
export class ModelUploadDialog implements OnInit {
  /** Template preselected in the "Use as" list. */
  readonly initialCatalogId = input<string>('office-chair');
  /** An uploaded model to edit instead of uploading a new one. */
  readonly editing = input<CustomModel | null>(null);
  /** Emits the new or edited model, or `null` when the dialog is dismissed. */
  readonly closed = output<CustomModel | null>();

  private readonly library = inject(ModelLibrary);
  private readonly units = inject(PlanStore).units;
  private readonly hostRef = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly modalRef = viewChild.required<ElementRef<HTMLElement>>('modal');

  protected readonly accept = MODEL_FILE_ACCEPT;
  protected readonly axes = ['x', 'y', 'z'] as const;
  protected readonly defaultOrientation = DEFAULT_ORIENTATION;
  protected readonly templateGroups = CATALOG_CATEGORIES.map((category) => ({
    category,
    items: CATALOG.filter((c) => c.category === category),
  }));

  protected readonly catalogId = signal('office-chair');
  protected readonly name = signal('');
  protected readonly orientation = signal<ModelOrientation>(DEFAULT_ORIENTATION);
  protected readonly status = signal<'idle' | 'reading' | 'ready'>('idle');
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly previewFailed = signal(false);
  protected readonly title = computed(() => (this.editing() ? 'Edit 3D model' : 'Upload 3D model'));
  protected readonly sizeText = computed(() => {
    const c = catalogItem(this.catalogId());
    const u = this.units();
    return `${formatLength(c.width, u)} × ${formatLength(c.depth, u)} × ${formatLength(c.height, u)}`;
  });

  private file: File | null = null;
  private module: Promise<PreviewModule> | null = null;
  private preview: ModelPreview | null = null;
  /** Counts file picks so a slow parse of an earlier file cannot overwrite a later one. */
  private pick = 0;
  private destroyed = false;

  constructor() {
    focusWhileOpen(() => this.modalRef().nativeElement);
    effect(() => {
      const c = catalogItem(this.catalogId());
      const o = this.orientation();
      if (this.status() === 'ready') this.preview?.fit(o, c.width / 100, c.depth / 100, c.height / 100);
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.preview?.dispose();
      this.preview = null;
    });
  }

  ngOnInit(): void {
    const model = this.editing();
    if (!model) {
      this.catalogId.set(this.initialCatalogId());
      return;
    }
    this.catalogId.set(model.catalogId);
    this.name.set(model.name);
    this.status.set('reading');
    this.library.bytes(model.id).then(
      (data) => {
        if (data) void this.load(data, model.fileName, ++this.pick);
        else this.fail(`${model.fileName} is no longer stored.`);
      },
      () => this.fail(`${model.fileName} could not be read from storage.`),
    );
  }

  protected async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    const pick = ++this.pick;
    this.file = null;
    this.error.set(null);
    this.status.set('idle');
    if (!file) return;
    if (!/\.(glb|gltf)$/i.test(file.name)) return this.error.set(`${file.name} is not a .glb or .gltf file.`);
    if (file.size > MAX_MODEL_BYTES) return this.error.set(`${file.name} is larger than ${MAX_MODEL_BYTES / 1024 / 1024} MB.`);

    this.status.set('reading');
    if (await this.load(await file.arrayBuffer(), file.name, pick)) {
      this.file = file;
      if (!this.name()) this.name.set(modelNameFromFile(file.name));
    }
  }

  /** Parses model bytes and shows them in the preview. Returns false if they could not be shown. */
  private async load(data: ArrayBuffer, fileName: string, pick: number): Promise<boolean> {
    let mod: PreviewModule;
    try {
      mod = await (this.module ??= import('../../preview3d/model-preview'));
    } catch (e) {
      console.warn(e);
      if (pick === this.pick) this.fail('The 3D preview could not be loaded.');
      return false;
    }
    let object;
    try {
      object = await mod.parseModel(data);
    } catch {
      if (pick === this.pick) this.fail(`${fileName} could not be read. Export it as a single .glb file with textures embedded.`);
      return false;
    }
    if (pick !== this.pick || this.destroyed) {
      mod.disposeObject(object);
      return false;
    }
    this.orientation.set(this.editing()?.orientation ?? DEFAULT_ORIENTATION);
    this.showInPreview(mod, object);
    this.status.set('ready');
    return true;
  }

  private fail(message: string): void {
    this.status.set('idle');
    this.error.set(message);
  }

  protected turn(axis: keyof ModelOrientation): void {
    this.orientation.update((o) => turnOrientation(o, axis));
  }

  protected async save(): Promise<void> {
    const editing = this.editing();
    if ((!editing && !this.file) || this.saving()) return;
    this.saving.set(true);
    try {
      if (editing) {
        await this.library.update(editing.id, { name: this.name(), catalogId: this.catalogId(), orientation: this.orientation() });
        this.closed.emit(this.library.model(editing.id) ?? editing);
      } else {
        this.closed.emit(await this.library.upload(this.file!, this.catalogId(), this.name(), this.orientation()));
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'The model could not be saved.');
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.closed.emit(null);
  }

  protected onKeyDown(e: KeyboardEvent): void {
    // Keep editor shortcuts (Delete, arrows, undo) from acting on the plan behind the dialog.
    e.stopPropagation();
    if (e.key === 'Escape') this.close();
  }

  private showInPreview(mod: PreviewModule, object: Parameters<ModelPreview['setModel']>[0]): void {
    if (!this.preview && !this.previewFailed()) {
      try {
        this.preview = new mod.ModelPreview(this.hostRef().nativeElement);
      } catch (e) {
        console.warn('Model preview unavailable.', e);
        this.previewFailed.set(true);
      }
    }
    if (this.preview) this.preview.setModel(object);
    else mod.disposeObject(object);
  }
}
