import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { catalogItem } from '../../model/catalog';
import { CustomModel, formatBytes } from '../../model/custom-model';
import { ModelLibrary } from '../../persistence/model-library';
import { FurnitureSymbol } from '../../shared/furniture-symbol';
import { Icon } from '../../shared/icon';
import { PlanStore } from '../../state/plan.store';

/** The uploaded 3D models, with upload, edit and delete. */
@Component({
  selector: 'app-model-library-panel',
  imports: [FurnitureSymbol, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <h2>3D models</h2>
      <button class="btn primary" (click)="upload.emit()"><app-icon name="upload" /> Upload model</button>
    </div>
    <p class="hint">Your models stand in for catalog furniture in the 3D view. They are stored in this browser.</p>

    @if (rows().length) {
      <ul>
        @for (row of rows(); track row.model.id) {
          <li [attr.aria-label]="row.model.name">
            <svg [attr.viewBox]="row.viewBox" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <g appFurnitureSymbol [shape]="row.template.shape" [width]="row.template.width" [depth]="row.template.depth" [color]="row.template.color" />
            </svg>
            <span class="text">
              <span class="name">{{ row.model.name }}</span>
              <span class="meta">{{ row.template.name }} · {{ row.size }}</span>
              <span class="meta">{{ row.usage }}</span>
            </span>
            @if (confirmingDelete() !== row.model.id) {
              <span class="buttons">
                <button class="btn ghost icon" title="Edit model" aria-label="Edit model" (click)="edit.emit(row.model)"><app-icon name="edit" /></button>
                <button class="btn ghost icon" title="Delete model" aria-label="Delete model" (click)="confirmingDelete.set(row.model.id)">
                  <app-icon name="trash" />
                </button>
              </span>
            } @else {
              <span class="confirm">
                <span>{{ row.used ? 'Items using it will show the default model.' : 'Delete this model?' }}</span>
                <span class="buttons">
                  <button class="btn danger" (click)="remove(row.model)">Delete</button>
                  <button class="btn ghost" (click)="confirmingDelete.set(null)">Keep</button>
                </span>
              </span>
            }
          </li>
        }
      </ul>
    } @else {
      <p class="empty">No models yet. Upload a .glb or .gltf file to use it for a piece of furniture.</p>
    }
  `,
  styles: `
    :host { display: block; min-height: 0; overflow-y: auto; padding: 12px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    h2 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
    .head .btn { height: 28px; padding: 0 10px; }
    .hint { margin: 8px 0 10px; color: var(--text-muted); font-size: 12px; }
    ul { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--border); }
    li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border); }
    svg { flex: none; width: 40px; height: 32px; }
    .text { display: flex; flex: 1; flex-direction: column; min-width: 0; }
    .name { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .meta { overflow: hidden; color: var(--text-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .buttons { display: flex; flex: none; gap: 2px; }
    .confirm { display: flex; flex-basis: 100%; flex-direction: column; gap: 6px; font-size: 12px; }
    .confirm > span:first-child { color: var(--text-muted); }
    .empty { padding: 16px 4px; color: var(--text-muted); }
  `,
})
export class ModelLibraryPanel {
  readonly edit = output<CustomModel>();
  readonly upload = output<void>();

  private readonly library = inject(ModelLibrary);
  private readonly plan = inject(PlanStore).plan;
  protected readonly confirmingDelete = signal<string | null>(null);

  protected readonly rows = computed(() => {
    const furniture = this.plan().furniture;
    return [...this.library.models()].reverse().map((model) => {
      const template = catalogItem(model.catalogId);
      const used = furniture.filter((f) => f.modelId === model.id).length;
      const pad = Math.max(template.width, template.depth) * 0.06;
      return {
        model,
        template,
        used,
        size: formatBytes(model.byteSize),
        usage: used ? `Used by ${used} item${used === 1 ? '' : 's'} in this plan` : 'Not used in this plan',
        viewBox: `${-template.width / 2 - pad} ${-template.depth / 2 - pad} ${template.width + pad * 2} ${template.depth + pad * 2}`,
      };
    });
  });

  protected async remove(model: CustomModel): Promise<void> {
    this.confirmingDelete.set(null);
    await this.library.remove(model.id);
  }
}
