import { inject, Injectable, signal } from '@angular/core';
import { snapFurnitureToWall } from '../geometry/furniture-geometry';
import { gridSize } from '../geometry/units';
import { removeNodes, removeWalls } from '../geometry/wall-geometry';
import { catalogItem } from '../model/catalog';
import { createFurniture } from '../model/defaults';
import { newId, Point } from '../model/plan.model';
import { EditorStore, SelectionItem } from './editor.store';
import { PlanStore } from './plan.store';

/** Editing commands shared by keyboard shortcuts, the toolbox and the properties panel. */
@Injectable({ providedIn: 'root' })
export class EditorActions {
  private readonly plan = inject(PlanStore);
  private readonly editor = inject(EditorStore);
  /** Size of the canvas in px, published by the canvas component. */
  readonly canvasSize = signal({ width: 800, height: 600 });

  /** World point at the center of the visible canvas. */
  viewCenter(): Point {
    const v = this.editor.viewport();
    const s = this.canvasSize();
    return { x: (s.width / 2 - v.x) / v.zoom, y: (s.height / 2 - v.y) / v.zoom };
  }

  placeFurniture(catalogId: string, at: Point = this.viewCenter()): void {
    const item = createFurniture(catalogId, at);
    if (!catalogItem(catalogId).noWallSnap) {
      // Snap when dropped within ~1.5 ft of a wall face (or 24px when zoomed far out).
      const tolerance = Math.max(45, 24 / this.editor.viewport().zoom);
      const snapped = snapFurnitureToWall(at, item, this.plan.segments(), tolerance, true);
      if (snapped) Object.assign(item, snapped);
    }
    this.plan.update((draft) => {
      draft.furniture.push(item);
    });
    this.editor.tool.set('select');
    this.editor.select([{ kind: 'furniture', id: item.id }]);
  }

  deleteSelection(): void {
    const sel = this.editor.selection();
    if (!sel.length) return;
    const ids = (kind: SelectionItem['kind']) => sel.filter((s) => s.kind === kind).map((s) => s.id);
    const furniture = new Set(ids('furniture'));
    const openings = new Set(ids('opening'));
    const walls = ids('wall');
    const nodes = ids('node');
    if (!furniture.size && !openings.size && !walls.length && !nodes.length) return;
    this.plan.update((draft) => {
      draft.furniture = draft.furniture.filter((f) => !furniture.has(f.id));
      draft.openings = draft.openings.filter((o) => !openings.has(o.id));
      if (walls.length) removeWalls(draft, walls);
      if (nodes.length) removeNodes(draft, nodes);
    });
    this.editor.clearSelection();
  }

  duplicateSelection(): void {
    const ids = new Set(this.editor.selection().filter((s) => s.kind === 'furniture').map((s) => s.id));
    if (!ids.size) return;
    const offset = gridSize(this.plan.units()) * 2;
    const created: SelectionItem[] = [];
    this.plan.update((draft) => {
      for (const f of draft.furniture.filter((x) => ids.has(x.id))) {
        const copy = { ...f, id: newId('f'), x: f.x + offset, y: f.y + offset };
        draft.furniture.push(copy);
        created.push({ kind: 'furniture', id: copy.id });
      }
    });
    this.editor.select(created);
  }

  rotateSelection(degrees: number): void {
    const ids = new Set(this.editor.selection().filter((s) => s.kind === 'furniture').map((s) => s.id));
    if (!ids.size) return;
    this.plan.update((draft) => {
      for (const f of draft.furniture) {
        if (!ids.has(f.id)) continue;
        let r = (((f.rotation + degrees) % 360) + 360) % 360;
        f.rotation = r > 180 ? r - 360 : r;
      }
    });
  }

  nudgeSelection(dx: number, dy: number): void {
    const ids = new Set(this.editor.selection().filter((s) => s.kind === 'furniture').map((s) => s.id));
    if (!ids.size) return;
    this.plan.update(
      (draft) => {
        for (const f of draft.furniture) {
          if (!ids.has(f.id)) continue;
          f.x += dx;
          f.y += dy;
        }
      },
      { coalesceKey: 'nudge' },
    );
  }

  selectAll(): void {
    const p = this.plan.plan();
    this.editor.select([
      ...p.furniture.map((f) => ({ kind: 'furniture' as const, id: f.id })),
      ...p.walls.map((w) => ({ kind: 'wall' as const, id: w.id })),
    ]);
  }
}
