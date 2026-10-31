/** Test-only helpers. Not imported by application code. */
import { Hit, ToolContext, ToolPointerEvent } from '../editor/tools/tool';
import { addWall } from '../geometry/wall-geometry';
import { Plan, Point } from '../model/plan.model';
import { EditorStore } from '../state/editor.store';
import { PlanStore } from '../state/plan.store';

export const WALL_PROPS = { thickness: 10, height: 240 };

/** Adds a closed rectangular room with its top-left corner at `origin`. Returns the wall ids (top, right, bottom, left). */
export function squareRoom(plan: Plan, w: number, h: number, origin: Point = { x: 0, y: 0 }, props = WALL_PROPS): string[] {
  const pts = [
    { x: origin.x, y: origin.y },
    { x: origin.x + w, y: origin.y },
    { x: origin.x + w, y: origin.y + h },
    { x: origin.x, y: origin.y + h },
  ];
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) ids.push(...addWall(plan, pts[i], pts[(i + 1) % 4], props).wallIds);
  return ids;
}

export function pointer(world: Point, opts: Partial<Omit<ToolPointerEvent, 'world'>> & { hit?: Hit | null } = {}): ToolPointerEvent {
  return {
    world,
    screen: opts.screen ?? world,
    hit: opts.hit ?? null,
    shift: opts.shift ?? false,
    alt: opts.alt ?? false,
    ctrl: opts.ctrl ?? false,
    button: opts.button ?? 0,
  };
}

export const TEST_TOLERANCE = 10;
export const TEST_GRID = 10;

/** Same shape as the canvas's tool context, with fixed tolerance and grid. */
export function toolContext(plan: PlanStore, editor: EditorStore): ToolContext {
  return {
    plan,
    editor,
    tolerance: () => TEST_TOLERANCE,
    grid: () => TEST_GRID,
    setTool: (id) => editor.tool.set(id),
  };
}

export function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, ...init });
}

/** In-memory `Storage` for repository tests. */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

/**
 * jsdom has no ResizeObserver. Installs a stub and returns a function that reports a size
 * to every observer created since, as the browser would after layout.
 */
export function installResizeObserver(): (width: number, height: number) => void {
  const observers: { cb: ResizeObserverCallback; self: ResizeObserver }[] = [];
  class StubResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      observers.push({ cb, self: this as unknown as ResizeObserver });
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;
  return (width, height) => {
    for (const o of observers) o.cb([{ contentRect: { width, height } } as unknown as ResizeObserverEntry], o.self);
  };
}
