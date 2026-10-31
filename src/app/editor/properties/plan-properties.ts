import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatArea } from '../../geometry/units';
import { DisplayUnits } from '../../model/plan.model';
import { LengthInput } from '../../shared/length-input';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';

/** Shown when nothing is selected: plan name, units, defaults for new walls, and a summary. */
@Component({
  selector: 'app-plan-properties',
  imports: [LengthInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './properties.css',
  template: `
    <h2>Plan</h2>
    <label class="field">
      <span>Name</span>
      <input class="input" [value]="plan.plan().name" (change)="rename($any($event.target).value)" />
    </label>
    <div class="field">
      <span>Units</span>
      <div class="segmented">
        <button [class.active]="units() === 'imperial'" (click)="setUnits('imperial')">Feet &amp; inches</button>
        <button [class.active]="units() === 'metric'" (click)="setUnits('metric')">Metric</button>
      </div>
    </div>
    <h3>New walls</h3>
    <div class="row">
      <label class="field">
        <span>Thickness</span>
        <app-length-input [value]="editor.wallThickness()" [units]="units()" [min]="2" [max]="100" label="New wall thickness" (valueChange)="editor.wallThickness.set($event)" />
      </label>
      <label class="field">
        <span>Height</span>
        <app-length-input [value]="editor.wallHeight()" [units]="units()" [min]="100" [max]="1000" label="New wall height" (valueChange)="editor.wallHeight.set($event)" />
      </label>
    </div>
    <h3>Summary</h3>
    <dl class="stats">
      <dt>Rooms</dt><dd>{{ stats().rooms }}</dd>
      <dt>Floor area</dt><dd>{{ stats().area }}</dd>
      <dt>Walls</dt><dd>{{ stats().walls }}</dd>
      <dt>Furniture</dt><dd>{{ stats().furniture }}</dd>
    </dl>
    <p class="tip">Select a wall, room, door, window or piece of furniture to edit it here.</p>
  `,
})
export class PlanProperties {
  protected readonly plan = inject(PlanStore);
  protected readonly editor = inject(EditorStore);
  protected readonly units = this.plan.units;

  protected readonly stats = computed(() => {
    const rooms = this.plan.rooms();
    const p = this.plan.plan();
    return {
      rooms: rooms.length,
      area: formatArea(
        rooms.reduce((s, r) => s + r.area, 0),
        this.units(),
      ),
      walls: p.walls.length,
      furniture: p.furniture.length,
    };
  });

  protected rename(name: string): void {
    this.plan.update((d) => {
      d.name = name.trim() || 'Untitled plan';
    });
  }

  protected setUnits(units: DisplayUnits): void {
    if (units === this.units()) return;
    this.plan.update((d) => {
      d.displayUnits = units;
    });
  }
}
