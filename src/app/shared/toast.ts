import { Injectable, signal } from '@angular/core';

export interface ToastAction {
  label: string;
  run(): void;
}

export interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
}

/** How long a toast stays; one with an action gets longer so there is time to use it. */
const SHOW_MS = 4000;
const SHOW_WITH_ACTION_MS = 8000;

/** Short messages that confirm what just happened, optionally with an action such as Undo. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(message: string, action?: ToastAction): void {
    const toast: Toast = { id: this.nextId++, message, action };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), action ? SHOW_WITH_ACTION_MS : SHOW_MS);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Runs a toast's action, then closes it. */
  act(toast: Toast): void {
    this.dismiss(toast.id);
    toast.action?.run();
  }
}
