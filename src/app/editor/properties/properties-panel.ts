import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { FurnitureProperties } from './furniture-properties';
import { OpeningProperties } from './opening-properties';
import { PlanProperties } from './plan-properties';
import { RoomProperties } from './room-properties';
import { CornerProperties, MultiProperties } from './selection-properties';
import { WallProperties } from './wall-properties';

/**
 * Right-hand panel. Resolves the current selection to the item it refers to and shows that
 * item's section; falls back to plan settings when nothing (or something deleted) is selected.
 */
@Component({
  selector: 'app-properties-panel',
  imports: [PlanProperties, WallProperties, CornerProperties, OpeningProperties, FurnitureProperties, RoomProperties, MultiProperties],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './properties-panel.css',
  template: `
    @let v = view();
    @switch (v.kind) {
      @case ('wall') { <app-wall-properties [segment]="v.segment" /> }
      @case ('node') { <app-corner-properties [wallCount]="v.walls" /> }
      @case ('opening') { <app-opening-properties [opening]="v.opening" [segment]="v.segment" /> }
      @case ('furniture') { <app-furniture-properties [item]="v.item" /> }
      @case ('room') { <app-room-properties [room]="v.room" /> }
      @case ('multi') { <app-multi-properties [count]="v.count" [allFurniture]="v.allFurniture" /> }
      @default { <app-plan-properties /> }
    }
  `,
})
export class PropertiesPanel {
  private readonly plan = inject(PlanStore);
  private readonly editor = inject(EditorStore);

  protected readonly view = computed(() => {
    const sel = this.editor.selection();
    const none = { kind: 'plan' as const };
    if (sel.length === 0) return none;
    if (sel.length > 1) return { kind: 'multi' as const, count: sel.length, allFurniture: sel.every((s) => s.kind === 'furniture') };
    const [s] = sel;
    const plan = this.plan.plan();
    switch (s.kind) {
      case 'wall': {
        const segment = this.plan.segmentById().get(s.id);
        return segment ? { kind: 'wall' as const, segment } : none;
      }
      case 'node':
        return this.plan.nodes().has(s.id) ? { kind: 'node' as const, walls: plan.walls.filter((w) => w.a === s.id || w.b === s.id).length } : none;
      case 'opening': {
        const opening = plan.openings.find((x) => x.id === s.id);
        const segment = opening && this.plan.segmentById().get(opening.wallId);
        return opening && segment ? { kind: 'opening' as const, opening, segment } : none;
      }
      case 'furniture': {
        const item = plan.furniture.find((x) => x.id === s.id);
        return item ? { kind: 'furniture' as const, item } : none;
      }
      case 'room': {
        const room = this.plan.rooms().find((x) => x.key === s.id);
        return room ? { kind: 'room' as const, room } : none;
      }
    }
  });
}
