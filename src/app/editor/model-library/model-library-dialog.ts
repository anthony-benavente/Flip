import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { catalogItem } from '../../model/catalog';
import { CustomModel, formatBytes } from '../../model/custom-model';
import { ModelLibrary } from '../../persistence/model-library';
import { FurnitureSymbol } from '../../shared/furniture-symbol';
import { focusWhileOpen, trapTab } from '../../shared/dom';
import { Icon } from '../../shared/icon';
import { PlanStore } from '../../state/plan.store';

/** Lists the uploaded 3D models, with edit, delete and upload. */
@Component({
  selector: 'app-model-library-dialog',
  imports: [FurnitureSymbol, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div #modal class="modal" role="dialog" aria-modal="true" tabindex="-1" aria-label="3D model library" (click)="$event.stopPropagation()" (keydown)="onKeyDown($event)">
        <div class="modal-head">
          <h2>3D model library</h2>
          <button class="btn ghost icon" aria-label="Close" (click)="closed.emit()"><app-icon name="close" /></button>
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
                  <span class="meta">{{ row.template.name }} · {{ row.model.fileName }} · {{ row.size }}</span>
                  <span class="meta">{{ row.usage }}</span>
                </span>
                @if (confirmingDelete() === row.model.id) {
                  <span class="confirm">
                    <span>{{ row.used ? 'Items using it will show the default model.' : 'Delete this model?' }}</span>
                    <button class="btn danger" (click)="remove(row.model)">Delete</button>
                    <button class="btn ghost" (click)="askDelete(null)">Keep</button>
                  </span>
                } @else {
                  <button class="btn" (click)="edit.emit(row.model)"><app-icon name="edit" /> Edit</button>
                  <button class="btn ghost icon" title="Delete model" aria-label="Delete model" (click)="askDelete(row.model.id)">
                    <app-icon name="trash" />
                  </button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="empty">No models yet. Upload a .glb or .gltf file to use it for a piece of furniture.</p>
        }

        <div class="actions">
          <button class="btn primary" (click)="upload.emit()"><app-icon name="upload" /> Upload model</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { width: min(600px, calc(100vw - 32px)); }
    .hint { margin: 6px 0 12px; color: var(--text-muted); font-size: 13px; }
    ul { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--border); }
    li { display: flex; align-items: center; gap: 12px; padding: 10px 2px; border-bottom: 1px solid var(--border); }
    svg { flex: none; width: 48px; height: 40px; }
    .text { display: flex; flex: 1; flex-direction: column; min-width: 0; }
    .name { font-weight: 600; }
    .meta { overflow: hidden; color: var(--text-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .confirm { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .confirm > span { max-width: 160px; color: var(--text-muted); }
    .empty { padding: 24px 8px; color: var(--text-muted); text-align: center; }
    .actions { display: flex; justify-content: flex-end; margin-top: 16px; }
  `,
})
export class ModelLibraryDialog {
  readonly closed = output<void>();
  readonly edit = output<CustomModel>();
  readonly upload = output<void>();

  private readonly library = inject(ModelLibrary);
  private readonly plan = inject(PlanStore).plan;
  protected readonly confirmingDelete = signal<string | null>(null);
  private readonly modalRef = viewChild.required<ElementRef<HTMLElement>>('modal');

  constructor() {
    focusWhileOpen(() => this.modalRef().nativeElement);
  }

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

  protected askDelete(id: string | null): void {
    this.confirmingDelete.set(id);
    this.keepFocus();
  }

  protected async remove(model: CustomModel): Promise<void> {
    this.confirmingDelete.set(null);
    await this.library.remove(model.id);
    this.keepFocus();
  }

  /** The clicked button is removed; keep focus in the dialog so Escape still closes it. */
  private keepFocus(): void {
    this.modalRef().nativeElement.focus();
  }

  protected onKeyDown(e: KeyboardEvent): void {
    // Keep editor shortcuts from acting on the plan behind the dialog.
    e.stopPropagation();
    trapTab(e, this.modalRef().nativeElement);
    if (e.key === 'Escape') this.closed.emit();
  }
}
