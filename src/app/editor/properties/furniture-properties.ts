import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ceilingHeightAt, itemElevation } from '../../geometry/elevation';
import { catalogItem, mountOf } from '../../model/catalog';
import { modelDisplayName } from '../../model/custom-model';
import { FURNITURE_SWATCHES } from '../../model/palettes';
import { lArms } from '../../model/furniture-symbols';
import { resetFurnitureSize, setFurnitureModel, setLArm, updateFurniture } from '../../model/plan-operations';
import { FurnitureItem, LArms } from '../../model/plan.model';
import { ModelLibrary } from '../../persistence/model-library';
import { ColorPick, ColorSwatches } from '../../shared/color-swatches';
import { Icon } from '../../shared/icon';
import { LengthInput } from '../../shared/length-input';
import { EditorActions } from '../../state/editor-actions';
import { PlanStore } from '../../state/plan.store';
import { ArtProperties } from './art-properties';

/** Label, size, rotation, height off the floor and color of one furniture item. */
@Component({
  selector: 'app-furniture-properties',
  imports: [ArtProperties, ColorSwatches, Icon, LengthInput],
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
    @if (arms(); as a) {
      <div class="row">
        <label class="field">
          <span>Main top depth</span>
          <app-length-input [value]="a.back" [units]="units()" [min]="1" [max]="f.depth" label="Main top depth" (valueChange)="setArm('back', $event)" />
        </label>
        <label class="field">
          <span>Return depth</span>
          <app-length-input [value]="a.side" [units]="units()" [min]="1" [max]="f.width" label="Return depth" (valueChange)="setArm('side', $event)" />
        </label>
      </div>
    }
    <div class="field">
      <span>Rotation</span>
      <div class="rotation">
        <input class="input" type="number" step="15" [value]="f.rotation" (change)="setRotation($any($event.target).value)" aria-label="Rotation in degrees" />
        <span class="unit">°</span>
        <button class="btn icon" title="Rotate 90° counter-clockwise" (click)="actions.rotateSelection(-90)">↺</button>
        <button class="btn icon" title="Rotate 90° clockwise (R)" (click)="actions.rotateSelection(90)">↻</button>
      </div>
    </div>
    @if (mount() === 'ceiling') {
      <p class="tip">Hangs from the ceiling. Height sets how far it drops.</p>
    } @else {
      <label class="field">
        <span>Off the floor</span>
        <app-length-input
          [value]="elevation()"
          [units]="units()"
          [min]="0"
          [max]="maxElevation()"
          label="Height off the floor"
          (valueChange)="update({ elevation: $event })"
        />
      </label>
    }
    <label class="field">
      <span>3D model</span>
      <select class="input" (change)="setModel($any($event.target).value)" aria-label="3D model">
        <option value="" [selected]="!f.modelId">Default</option>
        @for (m of modelOptions(); track m.id) {
          <option [value]="m.id" [selected]="m.id === f.modelId">{{ m.name }}</option>
        }
        @if (modelMissing()) {
          <option [value]="f.modelId" selected disabled>Missing model</option>
        }
      </select>
      @if (modelMissing()) {
        <small class="note">This item's uploaded model was deleted or is not in this browser. It shows the default model in 3D.</small>
      }
    </label>
    <div class="field">
      <span>Color</span>
      <app-color-swatches [swatches]="swatches" [selected]="f.color" [pickerValue]="f.color" (pick)="setColor($event)" />
    </div>
    @if (isArt()) {
      <app-art-properties [item]="f" />
    }
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
  private readonly library = inject(ModelLibrary);
  protected readonly typeName = computed(() => {
    const template = catalogItem(this.item().catalogId);
    const model = this.library.model(this.item().modelId);
    return model ? modelDisplayName(model, template) : template.name;
  });
  /** Models made for this item's template, plus the current one if it was made for another. */
  protected readonly modelOptions = computed(() => {
    const f = this.item();
    const current = this.library.model(f.modelId);
    const models = this.library.forTemplate(f.catalogId);
    return current && !models.includes(current) ? [...models, current] : models;
  });
  protected readonly isArt = computed(() => ['art', 'canvas-art'].includes(catalogItem(this.item().catalogId).shape));
  protected readonly mount = computed(() => mountOf(catalogItem(this.item().catalogId)));
  protected readonly elevation = computed(() => itemElevation(this.item(), this.plan.rooms()));
  protected readonly maxElevation = computed(() =>
    Math.max(0, ceilingHeightAt(this.plan.rooms(), this.item()) - this.item().height),
  );
  /** Arm depths for L-shaped items, null for everything else. */
  protected readonly arms = computed(() => {
    const f = this.item();
    return catalogItem(f.catalogId).shape === 'l-desk' ? lArms(f.width, f.depth, f.arms) : null;
  });
  protected readonly modelMissing = computed(() => !!this.item().modelId && !this.library.model(this.item().modelId));

  protected update(patch: Partial<Omit<FurnitureItem, 'id'>>, coalesceKey?: string): void {
    const id = this.item().id;
    this.plan.update((d) => updateFurniture(d, id, patch), { coalesceKey });
  }

  protected setModel(modelId: string): void {
    const id = this.item().id;
    this.plan.update((d) => setFurnitureModel(d, id, modelId || undefined));
  }

  protected setRotation(value: string): void {
    const deg = parseFloat(value);
    if (Number.isFinite(deg)) this.update({ rotation: deg });
  }

  protected setColor(pick: ColorPick): void {
    this.update({ color: pick.color }, pick.live ? `color:${this.item().id}` : undefined);
  }

  protected setArm(arm: keyof LArms, value: number): void {
    const id = this.item().id;
    this.plan.update((d) => setLArm(d, id, arm, value));
  }

  protected resetSize(): void {
    const id = this.item().id;
    this.plan.update((d) => resetFurnitureSize(d, id));
  }
}
