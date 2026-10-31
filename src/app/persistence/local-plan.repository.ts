import { Plan, PlanSummary } from '../model/plan.model';
import { migratePlan, PlanRepository } from './plan-repository';

const INDEX_KEY = 'flip.index';
const planKey = (id: string) => `flip.plan.${id}`;

/** Stores plans in the browser's localStorage: one index entry plus one key per plan. */
export class LocalPlanRepository implements PlanRepository {
  constructor(private readonly storage: Storage = localStorage) {}

  async list(): Promise<PlanSummary[]> {
    return this.readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Plan | null> {
    const raw = this.storage.getItem(planKey(id));
    if (!raw) return null;
    return migratePlan(JSON.parse(raw));
  }

  async save(plan: Plan): Promise<void> {
    this.storage.setItem(planKey(plan.id), JSON.stringify(plan));
    const index = this.readIndex().filter((s) => s.id !== plan.id);
    index.push({ id: plan.id, name: plan.name, updatedAt: plan.updatedAt });
    this.writeIndex(index);
  }

  async delete(id: string): Promise<void> {
    this.storage.removeItem(planKey(id));
    this.writeIndex(this.readIndex().filter((s) => s.id !== id));
  }

  async rename(id: string, name: string): Promise<void> {
    const plan = await this.get(id);
    if (!plan) return;
    await this.save({ ...plan, name, updatedAt: new Date().toISOString() });
  }

  private readIndex(): PlanSummary[] {
    try {
      const v = JSON.parse(this.storage.getItem(INDEX_KEY) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  private writeIndex(index: PlanSummary[]): void {
    this.storage.setItem(INDEX_KEY, JSON.stringify(index));
  }
}
