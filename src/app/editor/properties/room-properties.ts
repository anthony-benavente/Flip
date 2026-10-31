import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Room } from '../../geometry/room-detection';
import { formatArea, formatLength } from '../../geometry/units';
import { polygonPerimeter } from '../../geometry/vec';
import {
  CEILING_SWATCHES,
  FLOOR_MATERIALS,
  FLOOR_SWATCHES,
  matchingScheme,
  ROOM_SCHEMES,
  RoomScheme,
  schemeFinishes,
  TRIM_SWATCHES,
  WALL_SWATCHES,
} from '../../model/palettes';
import { RoomPatch, setRoomCeilingHeight, upsertRoomMeta } from '../../model/plan-operations';
import { ColorPick, ColorSwatches } from '../../shared/color-swatches';
import { LengthInput } from '../../shared/length-input';
import { PlanStore } from '../../state/plan.store';

type ColorField = 'floorColor' | 'wallColor' | 'ceilingColor' | 'trimColor';

/** Name, size, color scheme and finishes of a detected room. */
@Component({
  selector: 'app-room-properties',
  imports: [ColorSwatches, LengthInput],
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
    <h3>Color scheme</h3>
    <div class="schemes">
      @for (s of schemes; track s.name) {
        <button class="scheme" [class.active]="s === activeScheme()" [attr.aria-pressed]="s === activeScheme()" (click)="applyScheme(s)">
          <span class="scheme-dots" aria-hidden="true">
            @for (c of [s.floorColor, s.wallColor, s.trimColor, s.accent]; track $index) {
              <span [style.background]="c"></span>
            }
          </span>
          {{ s.name }}
        </button>
      }
    </div>
    <div class="field">
      <span>Floor</span>
      <div class="segmented materials" role="group" aria-label="Floor material">
        @for (m of materials; track m.id) {
          <button [class.active]="r.floorMaterial === m.id" (click)="update({ floorMaterial: m.id })">{{ m.name }}</button>
        }
      </div>
      <app-color-swatches [swatches]="floorSwatches" [selected]="r.floorColor" [pickerValue]="r.floorColor" customLabel="Custom floor color" (pick)="pickColor('floorColor', $event)" />
    </div>
    <div class="field">
      <span>Walls</span>
      <app-color-swatches [swatches]="wallSwatches" [selected]="r.wallColor" [pickerValue]="r.wallColor" customLabel="Custom wall color" (pick)="pickColor('wallColor', $event)" />
    </div>
    <div class="field">
      <span>Ceiling</span>
      <app-color-swatches [swatches]="ceilingSwatches" [selected]="r.ceilingColor" [pickerValue]="r.ceilingColor" customLabel="Custom ceiling color" (pick)="pickColor('ceilingColor', $event)" />
    </div>
    <label class="field">
      <span>Ceiling height</span>
      <app-length-input [value]="r.ceilingHeight" [units]="units()" [min]="150" [max]="1000" label="Ceiling height" (valueChange)="setCeilingHeight($event)" />
    </label>
    <div class="field">
      <span>Trim</span>
      <app-color-swatches [swatches]="trimSwatches" [selected]="r.trimColor" [pickerValue]="r.trimColor" customLabel="Custom trim color" (pick)="pickColor('trimColor', $event)" />
      <label class="check">
        <input type="checkbox" [checked]="r.crownMolding" (change)="update({ crownMolding: $any($event.target).checked })" />
        Crown molding
      </label>
    </div>
    <p class="tip">Ceiling height sets this room's walls; a wall shared with another room changes for both. Finishes show in the 3D preview. To paint one wall differently, select that wall and pick an accent color.</p>
  `,
})
export class RoomProperties {
  readonly room = input.required<Room>();

  private readonly plan = inject(PlanStore);
  protected readonly units = this.plan.units;
  protected readonly floorSwatches = FLOOR_SWATCHES;
  protected readonly wallSwatches = WALL_SWATCHES;
  protected readonly ceilingSwatches = CEILING_SWATCHES;
  protected readonly trimSwatches = TRIM_SWATCHES;
  protected readonly materials = FLOOR_MATERIALS;
  protected readonly schemes = ROOM_SCHEMES;
  protected readonly activeScheme = computed(() => matchingScheme(this.room()));
  protected readonly area = computed(() => formatArea(this.room().area, this.plan.units()));
  protected readonly perimeter = computed(() => formatLength(polygonPerimeter(this.room().polygon), this.plan.units()));

  protected update(patch: RoomPatch, coalesceKey?: string): void {
    const room = this.room();
    this.plan.update((d) => upsertRoomMeta(d, room, patch), { coalesceKey });
  }

  protected pickColor(field: ColorField, pick: ColorPick): void {
    this.update({ [field]: pick.color }, pick.live ? `${field}:${this.room().key}` : undefined);
  }

  /** Applies every finish of the scheme as one undo step. */
  protected applyScheme(scheme: RoomScheme): void {
    this.update(schemeFinishes(scheme));
  }

  protected setCeilingHeight(height: number): void {
    const room = this.room();
    this.plan.update((d) => setRoomCeilingHeight(d, room, height));
  }
}
