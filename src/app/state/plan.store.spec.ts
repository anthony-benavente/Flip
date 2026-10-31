import { TestBed } from '@angular/core/testing';
import { createStarterPlan } from '../model/defaults';
import { PlanStore } from './plan.store';

describe('PlanStore', () => {
  let store: PlanStore;

  beforeEach(() => {
    store = TestBed.inject(PlanStore);
    store.load(createStarterPlan());
  });

  it('detects the starter room', () => {
    expect(store.rooms()).toHaveLength(1);
    expect(store.rooms()[0].name).toBe('Living room');
  });

  it('undoes and redoes updates', () => {
    store.update((d) => {
      d.name = 'A';
    });
    store.update((d) => {
      d.name = 'B';
    });
    expect(store.plan().name).toBe('B');
    store.undo();
    expect(store.plan().name).toBe('A');
    store.undo();
    expect(store.plan().name).toBe('My room');
    expect(store.canUndo()).toBe(false);
    store.redo();
    expect(store.plan().name).toBe('A');
  });

  it('coalesces a drag into one undo step until commit', () => {
    for (let i = 1; i <= 5; i++) {
      store.update(
        (d) => {
          d.nodes[0].x = i * 10;
        },
        { coalesceKey: 'drag' },
      );
    }
    store.commit();
    store.update(
      (d) => {
        d.nodes[0].x = 999;
      },
      { coalesceKey: 'drag' },
    );
    expect(store.plan().nodes[0].x).toBe(999);
    store.undo();
    expect(store.plan().nodes[0].x).toBe(50);
    store.undo();
    expect(store.plan().nodes[0].x).toBe(0);
  });

  it('does not mutate previous snapshots', () => {
    const before = store.plan();
    store.update((d) => {
      d.nodes[0].x = 123;
    });
    expect(before.nodes[0].x).toBe(0);
  });

  it('clears redo after a new edit', () => {
    store.update((d) => {
      d.name = 'A';
    });
    store.undo();
    store.update((d) => {
      d.name = 'C';
    });
    expect(store.canRedo()).toBe(false);
  });

  it('bumps the revision on every change', () => {
    const r = store.revision();
    store.update((d) => {
      d.name = 'x';
    });
    store.undo();
    expect(store.revision()).toBe(r + 2);
  });
});
