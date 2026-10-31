import { InjectionToken } from '@angular/core';
import { CURRENT_SCHEMA_VERSION, Plan, PlanSummary } from '../model/plan.model';

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

export class PlanFormatError extends Error {}

/** Validates an unknown JSON value and upgrades it to the current schema. */
export function migratePlan(raw: unknown): Plan {
  if (!raw || typeof raw !== 'object') throw new PlanFormatError('Not a plan file.');
  const r = raw as Record<string, unknown>;
  const version = typeof r['schemaVersion'] === 'number' ? r['schemaVersion'] : 1;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new PlanFormatError('This plan was made with a newer version of Flip.');
  }
  const arr = (k: string): unknown[] => {
    const v = r[k];
    if (v === undefined) return [];
    if (!Array.isArray(v)) throw new PlanFormatError(`"${k}" must be a list.`);
    return v;
  };
  const nodes = arr('nodes');
  const walls = arr('walls');
  for (const n of nodes as Record<string, unknown>[]) {
    if (typeof n?.['id'] !== 'string' || typeof n['x'] !== 'number' || typeof n['y'] !== 'number') {
      throw new PlanFormatError('A wall corner is malformed.');
    }
  }
  const nodeIds = new Set((nodes as { id: string }[]).map((n) => n.id));
  for (const w of walls as Record<string, unknown>[]) {
    if (typeof w?.['id'] !== 'string' || !nodeIds.has(w['a'] as string) || !nodeIds.has(w['b'] as string)) {
      throw new PlanFormatError('A wall references a missing corner.');
    }
  }
  // Future schema upgrades go here: `if (version < 2) { ... }`.
  return {
    id: typeof r['id'] === 'string' ? r['id'] : crypto.randomUUID(),
    name: typeof r['name'] === 'string' && r['name'] ? r['name'] : 'Imported plan',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: typeof r['updatedAt'] === 'string' ? r['updatedAt'] : new Date().toISOString(),
    displayUnits: r['displayUnits'] === 'metric' ? 'metric' : 'imperial',
    nodes: nodes as Plan['nodes'],
    walls: walls as Plan['walls'],
    openings: arr('openings') as Plan['openings'],
    furniture: arr('furniture') as Plan['furniture'],
    rooms: arr('rooms') as Plan['rooms'],
  };
}
