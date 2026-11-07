import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatArea } from '../../geometry/units';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';

/** The rooms found in the plan; picking one selects it. */
@Component({
  selector: 'app-rooms-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Rooms</h2>
    @if (rows().length) {
      <ul>
        @for (r of rows(); track r.key) {
          <li>
            <button type="button" [class.active]="r.selected" [attr.aria-pressed]="r.selected" (click)="select(r.key)">
              <span class="chip" [style.background]="r.color"></span>
              <span class="name">{{ r.name }}</span>
              <span class="area">{{ r.area }}</span>
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="empty">No rooms yet. Draw walls that close a loop and the room appears here.</p>
    }
  `,
  styles: `
    :host { display: block; min-height: 0; overflow-y: auto; padding: 12px; }
    h2 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
    ul { margin: 0; padding: 0; list-style: none; }
    button { display: flex; align-items: center; gap: 8px; width: 100%; height: 36px; padding: 0 8px; border: 1px solid transparent;
      border-radius: var(--radius-sm); background: transparent; cursor: pointer; text-align: left; }
    button:hover { background: var(--surface-2); border-color: var(--border); }
    button.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); font-weight: 600; }
    .chip { flex: none; width: 14px; height: 14px; border: 1px solid rgb(0 0 0 / 15%); border-radius: 50%; }
    .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .area { color: var(--text-muted); font-size: 12px; font-weight: 400; }
    .empty { color: var(--text-muted); }
  `,
})
export class RoomsPanel {
  private readonly plan = inject(PlanStore);
  private readonly editor = inject(EditorStore);

  protected readonly rows = computed(() => {
    const units = this.plan.units();
    const selected = new Set(this.editor.selection().filter((s) => s.kind === 'room').map((s) => s.id));
    return this.plan.rooms().map((r) => ({ key: r.key, name: r.name, color: r.wallColor, area: formatArea(r.area, units), selected: selected.has(r.key) }));
  });

  protected select(key: string): void {
    this.editor.select([{ kind: 'room', id: key }]);
  }
}
