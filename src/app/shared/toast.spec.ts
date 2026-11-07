import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast';

describe('ToastService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a toast and removes it after a while', () => {
    const toasts = TestBed.inject(ToastService);
    toasts.show('Saved');
    expect(toasts.toasts().map((t) => t.message)).toEqual(['Saved']);
    vi.advanceTimersByTime(4000);
    expect(toasts.toasts()).toEqual([]);
  });

  it('keeps a toast with an action longer, and runs the action once', () => {
    const toasts = TestBed.inject(ToastService);
    const run = vi.fn();
    toasts.show('Deleted', { label: 'Undo', run });
    vi.advanceTimersByTime(4000);
    expect(toasts.toasts()).toHaveLength(1);
    toasts.act(toasts.toasts()[0]);
    expect(run).toHaveBeenCalledOnce();
    expect(toasts.toasts()).toEqual([]);
  });
});
