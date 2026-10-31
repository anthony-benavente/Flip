import { InjectionToken } from '@angular/core';
import { Plan, PlanSummary } from '../model/plan.model';

/**
 * Storage for plans. The browser implementation uses localStorage; a server-backed
 * implementation (for user accounts) can be swapped in via the PLAN_REPOSITORY token.
 */
export interface PlanRepository {
  list(): Promise<PlanSummary[]>;
  get(id: string): Promise<Plan | null>;
  save(plan: Plan): Promise<void>;
  delete(id: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
}

export const PLAN_REPOSITORY = new InjectionToken<PlanRepository>('PLAN_REPOSITORY');
