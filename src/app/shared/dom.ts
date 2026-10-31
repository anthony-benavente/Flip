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
