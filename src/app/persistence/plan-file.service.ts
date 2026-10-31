import { inject, Injectable } from '@angular/core';
import { newId, Plan } from '../model/plan.model';
import { migratePlan, PLAN_REPOSITORY, PlanFormatError } from './plan-repository';

export const PLAN_FILE_EXTENSION = '.flip.json';

/** Exports plans as JSON files and imports them back. */
@Injectable({ providedIn: 'root' })
export class PlanFileService {
  private readonly repo = inject(PLAN_REPOSITORY);

  export(plan: Plan): void {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName(plan.name)}${PLAN_FILE_EXTENSION}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Parses a file, saves it as a project, and returns it. Keeps the id unless it is taken. */
  async import(file: File): Promise<Plan> {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      throw new PlanFormatError(`${file.name} is not valid JSON.`);
    }
    const plan = migratePlan(json);
    if (await this.repo.get(plan.id)) plan.id = newId('p');
    await this.repo.save(plan);
    return plan;
  }
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'plan';
}
