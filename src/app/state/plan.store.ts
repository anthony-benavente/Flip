import { computed, Injectable, signal } from '@angular/core';
import { attachRoomMeta, detectRooms, Room } from '../geometry/room-detection';
import { nodeMap, WallSegment, wallSegments } from '../geometry/wall-geometry';
import { createEmptyPlan } from '../model/defaults';
import { Plan } from '../model/plan.model';

export const HISTORY_LIMIT = 100;

export interface UpdateOptions {
  /**
   * Consecutive updates with the same key merge into one undo step
   * (e.g. every pointer move of a drag). Call `commit()` to end the run.
   */
  coalesceKey?: string;
}

/** Holds the open plan document and its undo/redo history. */
@Injectable({ providedIn: 'root' })
export class PlanStore {
  private readonly _plan = signal<Plan>(createEmptyPlan());
  private readonly past = signal<Plan[]>([]);
  private readonly future = signal<Plan[]>([]);
  private lastCoalesceKey: string | null = null;
  /** Bumped on every document change, including undo/redo; drives autosave. */
  readonly revision = signal(0);

  readonly plan = this._plan.asReadonly();
  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);

  readonly units = computed(() => this._plan().displayUnits);
  readonly nodes = computed(() => nodeMap(this._plan()));
  readonly segments = computed<WallSegment[]>(() => wallSegments(this._plan()));
  readonly segmentById = computed(() => new Map(this.segments().map((s) => [s.wall.id, s])));
  private readonly detectedRooms = computed(
    () => detectRooms({ nodes: this._plan().nodes, walls: this._plan().walls }),
    // Room detection only depends on geometry; skip recompute when only furniture changed.
    { equal: (a, b) => a.length === b.length && a.every((r, i) => sameRoom(r, b[i])) },
  );
  readonly rooms = computed<Room[]>(() => attachRoomMeta(this.detectedRooms(), this._plan().rooms));

  /** Replaces the document and clears history (opening a plan). */
  load(plan: Plan): void {
    this._plan.set(plan);
    this.past.set([]);
    this.future.set([]);
    this.lastCoalesceKey = null;
  }

  /** Applies a mutation to a deep copy of the plan and records an undo step. */
  update(mutator: (draft: Plan) => void, opts: UpdateOptions = {}): void {
    const before = this._plan();
    const draft = structuredClone(before);
    mutator(draft);
    draft.updatedAt = new Date().toISOString();

    const coalesce = opts.coalesceKey !== undefined && opts.coalesceKey === this.lastCoalesceKey;
    if (!coalesce) {
      this.past.update((p) => [...p.slice(-(HISTORY_LIMIT - 1)), before]);
      this.future.set([]);
    }
    this.lastCoalesceKey = opts.coalesceKey ?? null;
    this._plan.set(draft);
    this.revision.update((r) => r + 1);
  }

  /** Ends a coalesced run so the next update starts a new undo step. */
  commit(): void {
    this.lastCoalesceKey = null;
  }

  undo(): void {
    const past = this.past();
    if (!past.length) return;
    const prev = past[past.length - 1];
    this.past.set(past.slice(0, -1));
    this.future.update((f) => [this._plan(), ...f]);
    this.lastCoalesceKey = null;
    this._plan.set(prev);
    this.revision.update((r) => r + 1);
  }

  redo(): void {
    const future = this.future();
    if (!future.length) return;
    const [next, ...rest] = future;
    this.future.set(rest);
    this.past.update((p) => [...p, this._plan()]);
    this.lastCoalesceKey = null;
    this._plan.set(next);
    this.revision.update((r) => r + 1);
  }
}

function sameRoom(a: { key: string; polygon: { x: number; y: number }[] }, b: typeof a): boolean {
  return (
    a.key === b.key &&
    a.polygon.length === b.polygon.length &&
    a.polygon.every((p, i) => p.x === b.polygon[i].x && p.y === b.polygon[i].y)
  );
}
