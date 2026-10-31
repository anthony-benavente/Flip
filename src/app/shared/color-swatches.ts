import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Swatch } from '../model/palettes';

export interface ColorPick {
  color: string;
  /**
   * True while the user drags in the custom picker. Callers merge live picks into one undo step
   * (pass a coalesce key to `PlanStore.update`).
   */
  live: boolean;
}

/** A row of preset color swatches plus a custom color picker. */
@Component({
  selector: 'app-color-swatches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="swatches">
      @for (s of swatches(); track s.color) {
        <button
          type="button"
          class="swatch"
          [class.active]="selected() === s.color"
          [style.background]="s.color"
          [title]="s.name"
          [attr.aria-label]="ariaSuffix() ? s.name + ariaSuffix() : null"
          (click)="pick.emit({ color: s.color, live: false })"
        ></button>
      }
      <input
        type="color"
        class="color"
        [value]="pickerValue()"
        [attr.aria-label]="customLabel()"
        (input)="pick.emit({ color: $any($event.target).value, live: true })"
      />
    </div>
  `,
  styles: `
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .swatch {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid rgb(0 0 0 / 15%);
      border-radius: 50%;
      cursor: pointer;
    }
    .swatch.active {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .color {
      width: 28px;
      height: 26px;
      padding: 0;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: none;
      cursor: pointer;
    }
  `,
})
export class ColorSwatches {
  readonly swatches = input.required<readonly Swatch[]>();
  /** Color whose swatch is marked active, or null for none. */
  readonly selected = input<string | null>(null);
  /** Color shown in the custom picker. */
  readonly pickerValue = input.required<string>();
  readonly customLabel = input('Custom color');
  /** When set, each swatch's accessible name is its name followed by this text. */
  readonly ariaSuffix = input('');
  readonly pick = output<ColorPick>();
}
