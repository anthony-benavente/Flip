import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { PLAN_REPOSITORY } from '../persistence/plan-repository';
import { PlanStore } from '../state/plan.store';

export const AUTOSAVE_DELAY_MS = 1000;

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

/**
 * Saves the open plan a moment after each change. Provide it on the editor page
 * (`providers: [Autosave]`) so it lives and flushes with the page.
 */
@Injectable()
export class Autosave {
  private readonly plan = inject(PlanStore);
  private readonly repo = inject(PLAN_REPOSITORY);

  readonly status = signal<SaveStatus>('saved');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  /** Revision of the document as last loaded; changes after it get saved. */
  private baseline = -1;

  constructor() {
    effect(() => {
      const revision = this.plan.revision();
      untracked(() => {
        if (this.active && revision !== this.baseline) this.schedule();
      });
    });
    inject(DestroyRef).onDestroy(() => this.flush());
  }

  /** Begins watching for changes made after the plan's current revision. */
  start(): void {
    this.baseline = this.plan.revision();
    this.active = true;
    this.status.set('saved');
  }

  /** Saves anything pending and stops watching (e.g. before loading another plan). */
  stop(): void {
    this.flush();
    this.active = false;
  }

  /** Saves immediately if a save is pending. */
  flush(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    void this.save();
  }

  private schedule(): void {
    this.status.set('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), AUTOSAVE_DELAY_MS);
  }

  private async save(): Promise<void> {
    this.timer = null;
    this.status.set('saving');
    try {
      await this.repo.save(this.plan.plan());
      if (!this.timer) this.status.set('saved');
    } catch (e) {
      console.error(e);
      this.status.set('error');
    }
  }
}
