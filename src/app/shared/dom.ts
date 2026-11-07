import { afterNextRender, DestroyRef, inject } from '@angular/core';

/** True when a key event comes from a text field, so editor shortcuts should not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/**
 * Moves focus into a dialog when it opens and back to where it was when it closes, so keys like
 * Escape reach the topmost dialog. Call from a component constructor.
 */
export function focusWhileOpen(dialog: () => HTMLElement): void {
  const previous = document.activeElement as HTMLElement | null;
  afterNextRender(() => dialog().focus());
  inject(DestroyRef).onDestroy(() => {
    if (previous?.isConnected) previous.focus();
  });
}

/** Keeps Tab and Shift+Tab inside a dialog. Call from the dialog's keydown handler. */
export function trapTab(e: KeyboardEvent, root: HTMLElement): void {
  if (e.key !== 'Tab') return;
  const focusable = Array.from(root.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(
    (el) => !el.hasAttribute('disabled') && !el.hidden,
  );
  if (!focusable.length) {
    e.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
