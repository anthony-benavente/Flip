import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { formatLength } from '../../geometry/units';
import { CATALOG, CATALOG_CATEGORIES, CatalogItem, catalogItem } from '../../model/catalog';
import { CustomModel, modelDisplayName } from '../../model/custom-model';
import { ModelLibrary } from '../../persistence/model-library';
import { FurnitureSymbol } from '../../shared/furniture-symbol';
import { EditorActions } from '../../state/editor-actions';
import { EditorStore, RailPanel, ToolId } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { Icon } from '../../shared/icon';
import { encodeFurnitureDrag, FURNITURE_DRAG_MIME, FurnitureDragData } from '../drag-drop';
import { ModelLibraryPanel } from '../model-library/model-library-panel';
import { RoomsPanel } from '../rooms/rooms-panel';
import { ModelUploadDialog } from '../model-upload/model-upload-dialog';

interface ToolButton {
  id: ToolId;
  label: string;
  icon: string;
  key: string;
}

interface RailTab {
  id: RailPanel;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-toolbox',
  imports: [Icon, FurnitureSymbol, ModelLibraryPanel, ModelUploadDialog, RoomsPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toolbox.html',
  styleUrl: './toolbox.css',
})
export class Toolbox {
  protected readonly editor = inject(EditorStore);
  private readonly planStore = inject(PlanStore);
  private readonly actions = inject(EditorActions);
  private readonly library = inject(ModelLibrary);

  protected readonly tools: ToolButton[] = [
    { id: 'select', label: 'Select', icon: 'select', key: 'V' },
    { id: 'wall', label: 'Wall', icon: 'wall', key: 'W' },
    { id: 'door', label: 'Door', icon: 'door', key: 'D' },
    { id: 'window', label: 'Window', icon: 'window', key: 'N' },
    { id: 'pan', label: 'Pan', icon: 'pan', key: 'H' },
  ];

  protected readonly tabs: RailTab[] = [
    { id: 'furniture', label: 'Decor', icon: 'furniture' },
    { id: 'models', label: 'Models', icon: 'cube' },
    { id: 'rooms', label: 'Rooms', icon: 'plan' },
  ];

  protected readonly query = signal('');
  protected readonly collapsed = signal<Set<string>>(new Set());

  /** The upload dialog, either uploading a new model (`editing: null`) or editing one. */
  protected readonly modelDialog = signal<{ editing: CustomModel | null } | null>(null);
  /** Model entry awaiting delete confirmation. */
  protected readonly confirmingDelete = signal<string | null>(null);

  /** Catalog items by category, each followed by the uploaded models that stand in for it. */
  protected readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    const units = this.planStore.units();
    const models = this.library.models();
    return CATALOG_CATEGORIES.map((category) => ({
      category,
      items: CATALOG.filter((c) => c.category === category)
        .flatMap((c) => [this.view(c, units), ...models.filter((m) => m.catalogId === c.id).map((m) => this.view(c, units, m))])
        .filter((item) => !q || item.name.toLowerCase().includes(q)),
    })).filter((g) => g.items.length);
  });

  private view(c: CatalogItem, units: 'imperial' | 'metric', model?: CustomModel) {
    const pad = Math.max(c.width, c.depth) * 0.06;
    const drag: FurnitureDragData = model ? { catalogId: c.id, modelId: model.id } : { catalogId: c.id };
    return {
      key: encodeFurnitureDrag(drag),
      drag,
      model,
      name: model ? modelDisplayName(model, c) : c.name,
      size: `${formatLength(c.width, units)} × ${formatLength(c.depth, units)}`,
      viewBox: `${-c.width / 2 - pad} ${-c.depth / 2 - pad} ${c.width + pad * 2} ${c.depth + pad * 2}`,
      shape: c.shape,
      w: c.width,
      d: c.depth,
      color: c.color,
    };
  }

  protected toggleGroup(category: string): void {
    this.collapsed.update((s) => {
      const next = new Set(s);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  protected onDragStart(e: DragEvent, drag: FurnitureDragData): void {
    const value = encodeFurnitureDrag(drag);
    e.dataTransfer?.setData(FURNITURE_DRAG_MIME, value);
    e.dataTransfer?.setData('text/plain', value);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }

  protected place(drag: FurnitureDragData): void {
    this.actions.placeFurniture(drag.catalogId, undefined, drag.modelId);
  }

  /** Template preselected in the upload dialog: the selected item's, else the office chair. */
  protected readonly uploadTemplate = computed(() => {
    const sel = this.editor.selection();
    const item = sel.length === 1 && sel[0].kind === 'furniture' ? this.planStore.plan().furniture.find((f) => f.id === sel[0].id) : undefined;
    return item ? catalogItem(item.catalogId).id : 'office-chair';
  });

  protected onModelDialogClosed(model: CustomModel | null): void {
    const uploaded = model && !this.modelDialog()?.editing;
    this.modelDialog.set(null);
    // A new upload shows up in the catalog; go there so it can be seen.
    if (uploaded) {
      this.query.set('');
      this.editor.panel.set('furniture');
    }
  }

  protected async remove(model: CustomModel): Promise<void> {
    this.confirmingDelete.set(null);
    await this.library.remove(model.id);
  }
}
