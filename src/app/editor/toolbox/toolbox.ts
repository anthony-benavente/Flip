import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { formatLength } from '../../geometry/units';
import { CATALOG, CATALOG_CATEGORIES, CatalogItem } from '../../model/catalog';
import { FurnitureSymbol } from '../../shared/furniture-symbol';
import { EditorActions } from '../../state/editor-actions';
import { EditorStore, ToolId } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { Icon } from '../../shared/icon';
import { FURNITURE_DRAG_MIME } from '../drag-drop';

interface ToolButton {
  id: ToolId;
  label: string;
  icon: string;
  key: string;
}

@Component({
  selector: 'app-toolbox',
  imports: [Icon, FurnitureSymbol],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toolbox.html',
  styleUrl: './toolbox.css',
})
export class Toolbox {
  protected readonly editor = inject(EditorStore);
  private readonly planStore = inject(PlanStore);
  private readonly actions = inject(EditorActions);

  protected readonly tools: ToolButton[] = [
    { id: 'select', label: 'Select', icon: 'select', key: 'V' },
    { id: 'wall', label: 'Wall', icon: 'wall', key: 'W' },
    { id: 'door', label: 'Door', icon: 'door', key: 'D' },
    { id: 'window', label: 'Window', icon: 'window', key: 'N' },
    { id: 'pan', label: 'Pan', icon: 'pan', key: 'H' },
  ];

  protected readonly query = signal('');
  protected readonly collapsed = signal<Set<string>>(new Set());

  protected readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    const units = this.planStore.units();
    return CATALOG_CATEGORIES.map((category) => ({
      category,
      items: CATALOG.filter((c) => c.category === category && (!q || c.name.toLowerCase().includes(q))).map((c) =>
        this.view(c, units),
      ),
    })).filter((g) => g.items.length);
  });

  private view(c: CatalogItem, units: 'imperial' | 'metric') {
    const pad = Math.max(c.width, c.depth) * 0.06;
    return {
      id: c.id,
      name: c.name,
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

  protected onDragStart(e: DragEvent, id: string): void {
    e.dataTransfer?.setData(FURNITURE_DRAG_MIME, id);
    e.dataTransfer?.setData('text/plain', id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }

  protected place(id: string): void {
    this.actions.placeFurniture(id);
  }
}
