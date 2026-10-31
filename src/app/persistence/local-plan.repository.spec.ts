import { createStarterPlan } from '../model/defaults';
import { LocalPlanRepository } from './local-plan.repository';
import { migratePlan, PlanFormatError } from './plan-repository';
import { MemoryStorage } from '../testing/fixtures';

describe('LocalPlanRepository', () => {
  it('round-trips a plan through storage', async () => {
    const repo = new LocalPlanRepository(new MemoryStorage());
    const plan = createStarterPlan('Test');
    await repo.save(plan);
    expect(await repo.get(plan.id)).toEqual(plan);
    expect((await repo.list()).map((s) => s.name)).toEqual(['Test']);
  });

  it('keeps accent wall colors through save and load', async () => {
    const repo = new LocalPlanRepository(new MemoryStorage());
    const plan = createStarterPlan('Accent');
    plan.walls[1].colors = { front: '#2f4a6d', back: '#d4a537' };
    await repo.save(plan);
    expect((await repo.get(plan.id))!.walls[1].colors).toEqual({ front: '#2f4a6d', back: '#d4a537' });
  });

  it('renames and deletes', async () => {
    const repo = new LocalPlanRepository(new MemoryStorage());
    const plan = createStarterPlan('Old');
    await repo.save(plan);
    await repo.rename(plan.id, 'New');
    expect((await repo.get(plan.id))?.name).toBe('New');
    await repo.delete(plan.id);
    expect(await repo.get(plan.id)).toBeNull();
    expect(await repo.list()).toEqual([]);
  });

  it('lists most recently updated first', async () => {
    const repo = new LocalPlanRepository(new MemoryStorage());
    await repo.save({ ...createStarterPlan('a'), updatedAt: '2026-01-01T00:00:00Z' });
    await repo.save({ ...createStarterPlan('b'), updatedAt: '2026-06-01T00:00:00Z' });
    expect((await repo.list()).map((s) => s.name)).toEqual(['b', 'a']);
  });
});

describe('migratePlan', () => {
  it('fills defaults for missing fields', () => {
    const p = migratePlan({ id: 'x', nodes: [], walls: [] });
    expect(p.name).toBe('Imported plan');
    expect(p.displayUnits).toBe('imperial');
    expect(p.furniture).toEqual([]);
  });

  it('rejects malformed files', () => {
    expect(() => migratePlan(null)).toThrow(PlanFormatError);
    expect(() => migratePlan({ nodes: 'nope' })).toThrow(PlanFormatError);
    expect(() => migratePlan({ nodes: [], walls: [{ id: 'w', a: 'missing', b: 'gone' }] })).toThrow(PlanFormatError);
    expect(() => migratePlan({ schemaVersion: 99 })).toThrow(/newer version/);
  });
});
