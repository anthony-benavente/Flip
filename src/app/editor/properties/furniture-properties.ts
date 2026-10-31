import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { catalogItem } from '../../model/catalog';
import { FURNITURE_SWATCHES } from '../../model/palettes';
import { resetFurnitureSize, updateFurniture } from '../../model/plan-operations';
import { FurnitureItem } from '../../model/plan.model';
import { ColorPick, ColorSwatches } from '../../shared/color-swatches';
import { Icon } from '../../shared/icon';
import { LengthInput } from '../../shared/length-input';
import { EditorActions } from '../../state/editor-actions';
import { PlanStore } from '../../state/plan.store';

/** Label, size, rotation and color of one furniture item. */
@Component({
  selector: 'app-furniture-properties',
  imports: [ColorSwatches, Icon, LengthInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './properties.css',
  template: `
    @let f = item();
    <h2>{{ f.label || typeName() }}</h2>
    <label class="field">
      <span>Label</span>
      <input class="input" [value]="f.label ?? ''" [placeholder]="typeName()" (change)="update({ label: $any($event.target).value })" />
    </label>
    <div class="row three">
      <label class="field">
        <span>Width</span>
        <app-length-input [value]="f.width" [units]="units()" [min]="5" [max]="2000" label="Width" (valueChange)="update({ width: $event })" />
      </label>
      <label class="field">
        <span>Depth</span>
        <app-length-input [value]="f.depth" [units]="units()" [min]="5" [max]="2000" label="Depth" (valueChange)="update({ depth: $event })" />
      </label>
      <label class="field">
        <span>Height</span>
        <app-length-input [value]="f.height" [units]="units()" [min]="1" [max]="1000" label="Height" (valueChange)="update({ height: $event })" />
      </label>
    </div>
    <div class="field">
      <span>Rotation</span>
      <div class="rotation">
        <input class="input" type="number" step="15" [value]="f.rotation" (change)="setRotation($any($event.target).value)" aria-label="Rotation in degrees" />
        <span class="unit">°</span>
        <button class="btn icon" title="Rotate 90° counter-clockwise" (click)="actions.rotateSelection(-90)">↺</button>
        <button class="btn icon" title="Rotate 90° clockwise (R)" (click)="actions.rotateSelection(90)">↻</button>
      </div>
    </div>
    <div class="field">
      <span>Color</span>
      <app-color-swatches [swatches]="swatches" [selected]="f.color" [pickerValue]="f.color" (pick)="setColor($event)" />
    </div>
    <div class="actions">
      <button class="btn" (click)="actions.duplicateSelection()"><app-icon name="copy" /> Duplicate</button>
      <button class="btn ghost" (click)="resetSize()">Reset size</button>
      <button class="btn danger" (click)="actions.deleteSelection()"><app-icon name="trash" /></button>
    </div>
  `,
})
export class FurnitureProperties {
  readonly item = input.required<FurnitureItem>();

  private readonly plan = inject(PlanStore);
  protected readonly actions = inject(EditorActions);
  protected readonly units = this.plan.units;
  protected readonly swatches = FURNITURE_SWATCHES;
  protected readonly typeName = computed(() => catalogItem(this.item().catalogId).name);

  protected update(patch: Partial<Omit<FurnitureItem, 'id'>>, coalesceKey?: string): void {
    const id = this.item().id;
    this.plan.update((d) => updateFurniture(d, id, patch), { coalesceKey });
  }

  protected setRotation(value: string): void {
    const deg = parseFloat(value);
    if (Number.isFinite(deg)) this.update({ rotation: deg });
  }

  protected setColor(pick: ColorPick): void {
    this.update({ color: pick.color }, pick.live ? `color:${this.item().id}` : undefined);
  }

  protected resetSize(): void {
    const id = this.item().id;
    this.plan.update((d) => resetFurnitureSize(d, id));
  }
}
