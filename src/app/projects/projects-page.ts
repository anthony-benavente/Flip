import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { createEmptyPlan, createStarterPlan } from '../model/defaults';
import { newId, Plan } from '../model/plan.model';
import { PlanFileService } from '../persistence/plan-file.service';
import { PLAN_REPOSITORY } from '../persistence/plan-repository';
import { Icon } from '../shared/icon';
import { PlanThumbnail } from '../shared/plan-thumbnail';

@Component({
  selector: 'app-projects-page',
  imports: [Icon, PlanThumbnail, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-page.html',
  styleUrl: './projects-page.css',
})
export class ProjectsPage {
  private readonly repo = inject(PLAN_REPOSITORY);
  private readonly files = inject(PlanFileService);
  private readonly router = inject(Router);

  protected readonly plans = signal<Plan[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly renamingId = signal<string | null>(null);
  protected readonly confirmDeleteId = signal<string | null>(null);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    effect(() => {
      const input = this.nameInput()?.nativeElement;
      input?.focus();
      input?.select();
    });
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const summaries = await this.repo.list();
      const plans = await Promise.all(summaries.map((s) => this.repo.get(s.id)));
      this.plans.set(plans.filter((p): p is Plan => !!p));
    } catch (e) {
      this.plans.set([]);
      this.error.set(`Could not load your projects: ${(e as Error).message}`);
    }
  }

  async create(kind: 'starter' | 'blank'): Promise<void> {
    const plan = kind === 'starter' ? createStarterPlan('My room') : createEmptyPlan('Untitled plan');
    await this.repo.save(plan);
    await this.router.navigate(['/plan', plan.id]);
  }

  open(plan: Plan): void {
    void this.router.navigate(['/plan', plan.id]);
  }

  async rename(plan: Plan, name: string): Promise<void> {
    // Escape and Enter close the field, and the blur that follows must not commit again.
    if (this.renamingId() !== plan.id) return;
    this.renamingId.set(null);
    name = name.trim();
    if (!name || name === plan.name) return;
    await this.repo.rename(plan.id, name);
    await this.refresh();
  }

  async duplicate(plan: Plan): Promise<void> {
    const copy: Plan = { ...structuredClone(plan), id: newId('p'), name: `${plan.name} copy`, updatedAt: new Date().toISOString() };
    await this.repo.save(copy);
    await this.refresh();
  }

  async remove(plan: Plan): Promise<void> {
    this.confirmDeleteId.set(null);
    await this.repo.delete(plan.id);
    await this.refresh();
  }

  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);
    try {
      const plan = await this.files.import(file);
      await this.router.navigate(['/plan', plan.id]);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  stats(plan: Plan): string {
    const parts = [`${plan.walls.length} walls`, `${plan.furniture.length} items`];
    return parts.join(' · ');
  }
}
