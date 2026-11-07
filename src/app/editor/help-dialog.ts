import { ChangeDetectionStrategy, Component, ElementRef, output, viewChild } from '@angular/core';
import { focusWhileOpen, trapTab } from '../shared/dom';
import { Icon } from '../shared/icon';
import { HELP_ROWS } from './shortcuts';

/** The keyboard shortcut list, rendered from the same table that dispatches the keys. */
@Component({
  selector: 'app-help-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <div #modal class="modal" role="dialog" aria-modal="true" tabindex="-1" aria-label="Keyboard shortcuts" (click)="$event.stopPropagation()" (keydown)="onKeyDown($event)">
        <div class="modal-head">
          <h2>Keyboard shortcuts</h2>
          <button class="btn ghost icon" aria-label="Close" (click)="closed.emit()"><app-icon name="close" /></button>
        </div>
        <dl>
          @for (s of rows; track s.keys) {
            <dt><kbd>{{ s.keys }}</kbd></dt>
            <dd>{{ s.label }}</dd>
          }
        </dl>
      </div>
    </div>
  `,
})
export class HelpDialog {
  readonly closed = output<void>();
  protected readonly rows = HELP_ROWS;
  private readonly modalRef = viewChild.required<ElementRef<HTMLElement>>('modal');

  constructor() {
    focusWhileOpen(() => this.modalRef().nativeElement);
  }

  protected onKeyDown(e: KeyboardEvent): void {
    // Keep editor shortcuts from acting on the plan behind the dialog.
    e.stopPropagation();
    trapTab(e, this.modalRef().nativeElement);
    if (e.key === 'Escape' || e.key === '?') this.closed.emit();
  }
}
