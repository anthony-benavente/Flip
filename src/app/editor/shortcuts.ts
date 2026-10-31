/**
 * Editor keyboard shortcuts. This table is the single source of truth: the editor page dispatches
 * key presses through it and the help dialog lists it. Tool-specific keys (typed wall lengths,
 * Esc while drawing) are handled by the active tool before this table is consulted.
 */
import { gridSize } from '../geometry/units';
import { EditorActions } from '../state/editor-actions';
import { EditorStore } from '../state/editor.store';
import { PlanStore } from '../state/plan.store';

export interface ShortcutContext {
  plan: PlanStore;
  editor: EditorStore;
  actions: EditorActions;
}

export interface KeyCombo {
  /** `KeyboardEvent.key`, lower-cased. */
  key: string;
  /** Ctrl (or Cmd on macOS) must be held. Default false. */
  ctrl?: boolean;
  /** Shift must be held (true), must not be (false), or either (undefined). */
  shift?: boolean;
}

export interface Shortcut {
  /** How the keys are written in the help dialog. */
  keys: string;
  label: string;
  combos: KeyCombo[];
  run(ctx: ShortcutContext, e: KeyboardEvent): void;
}

export interface HelpRow {
  keys: string;
  label: string;
}

const tool = (id: Parameters<EditorStore['tool']['set']>[0]) => (ctx: ShortcutContext) => ctx.editor.tool.set(id);

/** Nudge distance: a fine step, or a large one with Shift. */
function nudgeStep(ctx: ShortcutContext, e: KeyboardEvent): number {
  const grid = gridSize(ctx.plan.units());
  return e.shiftKey ? grid * 4 : grid / 6;
}

const NUDGE: Record<string, [number, number]> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1],
};

export const SHORTCUTS: Shortcut[] = [
  { keys: 'V', label: 'Select tool', combos: [{ key: 'v' }], run: tool('select') },
  { keys: 'W', label: 'Wall tool', combos: [{ key: 'w' }], run: tool('wall') },
  { keys: 'D', label: 'Door tool', combos: [{ key: 'd' }], run: tool('door') },
  { keys: 'N', label: 'Window tool', combos: [{ key: 'n' }], run: tool('window') },
  { keys: 'H / hold Space', label: 'Pan', combos: [{ key: 'h' }], run: tool('pan') },
  { keys: 'F', label: 'Fit plan to screen', combos: [{ key: 'f' }], run: (ctx) => ctx.editor.requestFit() },
  { keys: '3', label: 'Cycle plan / split / 3D', combos: [{ key: '3' }], run: (ctx) => ctx.editor.cycleViewMode() },
  { keys: 'E', label: 'Open or close the selected wall\'s elevation', combos: [{ key: 'e' }], run: (ctx) => ctx.actions.toggleElevation() },
  { keys: 'Ctrl+Z', label: 'Undo', combos: [{ key: 'z', ctrl: true, shift: false }], run: (ctx) => ctx.plan.undo() },
  {
    keys: 'Ctrl+Y / Ctrl+Shift+Z',
    label: 'Redo',
    combos: [
      { key: 'y', ctrl: true },
      { key: 'z', ctrl: true, shift: true },
    ],
    run: (ctx) => ctx.plan.redo(),
  },
  { keys: 'Delete', label: 'Delete selection', combos: [{ key: 'delete' }, { key: 'backspace' }], run: (ctx) => ctx.actions.deleteSelection() },
  { keys: 'Ctrl+D', label: 'Duplicate furniture', combos: [{ key: 'd', ctrl: true }], run: (ctx) => ctx.actions.duplicateSelection() },
  {
    keys: 'R / Shift+R',
    label: 'Rotate furniture 90°',
    combos: [{ key: 'r' }],
    run: (ctx, e) => ctx.actions.rotateSelection(e.shiftKey ? -90 : 90),
  },
  {
    keys: 'Arrows',
    label: 'Nudge furniture (Shift for larger steps)',
    combos: Object.keys(NUDGE).map((key) => ({ key })),
    run: (ctx, e) => {
      const [dx, dy] = NUDGE[e.key.toLowerCase()];
      const step = nudgeStep(ctx, e);
      ctx.actions.nudgeSelection(dx * step, dy * step);
    },
  },
  { keys: 'Ctrl+A', label: 'Select all', combos: [{ key: 'a', ctrl: true }], run: (ctx) => ctx.actions.selectAll() },
  { keys: 'Esc', label: 'Finish wall / cancel / deselect', combos: [{ key: 'escape' }], run: (ctx) => ctx.editor.clearSelection() },
  { keys: '?', label: 'Show this help', combos: [{ key: '?' }], run: (ctx) => ctx.editor.showHelp.update((v) => !v) },
];

/** Mouse and modifier gestures, listed in help but not dispatched from here. */
export const GESTURES: HelpRow[] = [
  { keys: 'Scroll', label: 'Zoom' },
  { keys: 'Shift (drawing)', label: 'Lock walls to 90°' },
  { keys: 'Alt (dragging)', label: 'Turn off snapping' },
  { keys: 'Type a number', label: 'Set exact wall length while drawing, then Enter' },
];

export const HELP_ROWS: HelpRow[] = [...SHORTCUTS.map(({ keys, label }) => ({ keys, label })), ...GESTURES];

export function comboMatches(combo: KeyCombo, e: KeyboardEvent): boolean {
  if (e.altKey) return false;
  if (e.key.toLowerCase() !== combo.key) return false;
  if ((e.ctrlKey || e.metaKey) !== (combo.ctrl ?? false)) return false;
  return combo.shift === undefined || combo.shift === e.shiftKey;
}

export function findShortcut(e: KeyboardEvent, shortcuts: Shortcut[] = SHORTCUTS): Shortcut | undefined {
  return shortcuts.find((s) => s.combos.some((c) => comboMatches(c, e)));
}
