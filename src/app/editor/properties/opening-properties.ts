import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { WallSegment } from '../../geometry/wall-geometry';
import { updateOpening } from '../../model/plan-operations';
import { DOOR_SWATCHES, DEFAULT_DOOR_COLOR } from '../../model/palettes';
import { Opening } from '../../model/plan.model';
import { ColorPick, ColorSwatches } from '../../shared/color-swatches';
import { Icon } from '../../shared/icon';
import { LengthInput } from '../../shared/length-input';
import { EditorActions } from '../../state/editor-actions';
import { PlanStore } from '../../state/plan.store';

/** Size and position of a door or window; hinge side and swing for doors, sill height for windows. */
@Component({
  selector: 'app-opening-properties',
  imports: [ColorSwatches, Icon, LengthInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './properties.css',
  template: `
    @let o = opening();
    @let wallLength = segment().length;
    @let wallHeight = segment().wall.height;
    <h2>{{ o.kind === 'door' ? 'Door' : 'Window' }}</h2>
    <div class="row">
      <label class="field">
        <span>Width</span>
        <app-length-input [value]="o.width" [units]="units()" [min]="20" [max]="wallLength" label="Opening width" (valueChange)="update({ width: $event })" />
      </label>
      <label class="field">
        <span>Height</span>
        <app-length-input [value]="o.height" [units]="units()" [min]="20" [max]="wallHeight - o.sillHeight" label="Opening height" (valueChange)="update({ height: $event })" />
      </label>
    </div>
    @if (o.kind === 'window') {
      <label class="field">
        <span>Sill height</span>
        <app-length-input [value]="o.sillHeight" [units]="units()" [min]="0" [max]="wallHeight - o.height" label="Sill height" (valueChange)="update({ sillHeight: $event })" />
      </label>
    } @else {
      <div class="field">
        <span>Hinge side</span>
        <div class="segmented">
          <button [class.active]="o.swing !== 'right'" (click)="update({ swing: 'left' })">Left</button>
          <button [class.active]="o.swing === 'right'" (click)="update({ swing: 'right' })">Right</button>
        </div>
      </div>
      <div class="field">
        <span>Swing direction</span>
        <button class="btn" (click)="update({ flip: !o.flip })"><app-icon name="flip" /> Flip to other side</button>
      </div>
      <div class="field">
        <span>Color</span>
        <app-color-swatches
          [swatches]="doorSwatches"
          [selected]="o.color ?? defaultColor"
          [pickerValue]="o.color ?? defaultColor"
          [customLabel]="'Custom door color'"
          (pick)="paint($event)"
        />
      </div>
    }
    <label class="field">
      <span>Distance from wall start</span>
      <app-length-input
        [value]="o.offset - o.width / 2"
        [units]="units()"
        [min]="0"
        [max]="wallLength - o.width"
        label="Distance from wall start"
        (valueChange)="update({ offset: $event + o.width / 2 })"
      />
    </label>
    <div class="actions">
      <button class="btn danger" (click)="actions.deleteSelection()"><app-icon name="trash" /> Delete</button>
    </div>
  `,
})
export class OpeningProperties {
  readonly opening = input.required<Opening>();
  /** The wall the opening sits in. */
  readonly segment = input.required<WallSegment>();

  private readonly plan = inject(PlanStore);
  protected readonly actions = inject(EditorActions);
  protected readonly units = this.plan.units;
  protected readonly doorSwatches = DOOR_SWATCHES;
  protected readonly defaultColor = DEFAULT_DOOR_COLOR;

  protected paint(pick: ColorPick): void {
    const id = this.opening().id;
    this.plan.update((d) => updateOpening(d, id, { color: pick.color }), { coalesceKey: pick.live ? `door-color:${id}` : undefined });
  }

  protected update(patch: Partial<Omit<Opening, 'id' | 'wallId'>>): void {
    const id = this.opening().id;
    this.plan.update((d) => updateOpening(d, id, patch));
  }
}
