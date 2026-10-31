import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { formatLength, parseLength } from '../geometry/units';
import { DisplayUnits } from '../model/plan.model';

/** Text field that shows a length in the plan's units and accepts typed lengths like `12' 6"` or `3.2m`. */
@Component({
  selector: 'app-length-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      class="input"
      [class.invalid]="invalid()"
      [value]="draft() ?? formatted()"
      [attr.aria-label]="label()"
      (focus)="onFocus($event)"
      (input)="draft.set($any($event.target).value); invalid.set(false)"
      (keydown.enter)="commit($event)"
      (keydown.escape)="cancel($event)"
      (blur)="commit($event)"
    />
  `,
  styles: ':host { display: block; }',
})
export class LengthInput {
  readonly value = input.required<number>();
  readonly units = input.required<DisplayUnits>();
  readonly min = input(1);
  readonly max = input(100000);
  readonly label = input('');
  readonly valueChange = output<number>();

  protected readonly draft = signal<string | null>(null);
  protected readonly invalid = signal(false);
  protected readonly formatted = computed(() => formatLength(this.value(), this.units()));

  protected onFocus(e: FocusEvent): void {
    this.draft.set(this.formatted());
    queueMicrotask(() => (e.target as HTMLInputElement).select());
  }

  protected commit(e: Event): void {
    const text = this.draft();
    if (text === null) return;
    const v = parseLength(text, this.units());
    if (v === null || v < this.min() || v > this.max()) {
      if (e.type === 'blur') {
        this.draft.set(null);
        this.invalid.set(false);
      } else {
        this.invalid.set(true);
      }
      return;
    }
    this.draft.set(e.type === 'blur' ? null : formatLength(v, this.units()));
    if (Math.abs(v - this.value()) > 0.01) this.valueChange.emit(v);
    if (e.type !== 'blur') (e.target as HTMLInputElement).select();
  }

  protected cancel(e: Event): void {
    this.draft.set(null);
    this.invalid.set(false);
    (e.target as HTMLInputElement).blur();
  }
}
