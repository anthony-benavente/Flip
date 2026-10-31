import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Room } from '../../geometry/room-detection';
import { formatArea, formatLength } from '../../geometry/units';
import { polygonPerimeter } from '../../geometry/vec';
import { FLOOR_SWATCHES, WALL_SWATCHES } from '../../model/palettes';
import { upsertRoomMeta } from '../../model/plan-operations';
import { RoomMeta } from '../../model/plan.model';
import { ColorPick, ColorSwatches } from '../../shared/color-swatches';
import { PlanStore } from '../../state/plan.store';

type RoomPatch = Partial<Pick<RoomMeta, 'name' | 'floorColor' | 'wallColor'>>;

/** Name, size and colors of a detected room. */
@Component({
  selector: 'app-room-properties',
  imports: [ColorSwatches],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './properties.css',
  template: `
    @let r = room();
    <h2>Room</h2>
    <label class="field">
      <span>Name</span>
      <input class="input" [value]="r.name" (change)="update({ name: $any($event.target).value.trim() || 'Room' })" />
    </label>
    <dl class="stats">
      <dt>Area</dt><dd>{{ area() }}</dd>
      <dt>Perimeter</dt><dd>{{ perimeter() }}</dd>
    </dl>
    <div class="field">
      <span>Floor</span>
      <app-color-swatches [swatches]="floorSwatches" [selected]="r.floorColor" [pickerValue]="r.floorColor" customLabel="Custom floor color" (pick)="pickColor('floorColor', $event)" />
    </div>
    <div class="field">
      <span>Walls</span>
      <app-color-swatches [swatches]="wallSwatches" [selected]="r.wallColor" [pickerValue]="r.wallColor" customLabel="Custom wall color" (pick)="pickColor('wallColor', $event)" />
    </div>
    <p class="tip">Colors show in the 3D preview. To paint one wall differently, select that wall and pick an accent color.</p>
  `,
})
export class RoomProperties {
  readonly room = input.required<Room>();

  private readonly plan = inject(PlanStore);
  protected readonly floorSwatches = FLOOR_SWATCHES;
  protected readonly wallSwatches = WALL_SWATCHES;
  protected readonly area = computed(() => formatArea(this.room().area, this.plan.units()));
  protected readonly perimeter = computed(() => formatLength(polygonPerimeter(this.room().polygon), this.plan.units()));

  protected update(patch: RoomPatch, coalesceKey?: string): void {
    const room = this.room();
    this.plan.update((d) => upsertRoomMeta(d, room, patch), { coalesceKey });
  }

  protected pickColor(field: 'floorColor' | 'wallColor', pick: ColorPick): void {
    this.update({ [field]: pick.color }, pick.live ? `${field}:${this.room().key}` : undefined);
  }
}
