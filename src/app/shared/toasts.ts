import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast';

/** Shows the pending toasts at the bottom of the page. Mounted once, in the app shell. */
@Component({
  selector: 'app-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" role="status" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast">
          <span>{{ t.message }}</span>
          @if (t.action; as a) {
            <button type="button" class="act" (click)="toast.act(t)">{{ a.label }}</button>
          }
          <button type="button" class="close" aria-label="Dismiss" (click)="toast.dismiss(t.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .stack { position: fixed; left: 50%; bottom: 40px; z-index: 20; display: flex; flex-direction: column; gap: 8px;
      align-items: center; transform: translateX(-50%); pointer-events: none; }
    .toast { display: flex; align-items: center; gap: 12px; max-width: min(520px, calc(100vw - 32px)); padding: 8px 8px 8px 14px;
      border-radius: var(--radius); background: var(--text); color: var(--surface); box-shadow: var(--shadow); pointer-events: auto; }
    button { border: none; background: transparent; color: inherit; cursor: pointer; }
    .act { padding: 4px 8px; border-radius: var(--radius-sm); font-weight: 600; color: var(--toast-action); }
    .act:hover { background: rgb(255 255 255 / 12%); }
    .close { width: 24px; height: 24px; font-size: 18px; line-height: 1; opacity: 0.7; }
    .close:hover { opacity: 1; }
  `,
})
export class Toasts {
  protected readonly toast = inject(ToastService);
}
