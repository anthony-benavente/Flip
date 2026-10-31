import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatLength, gridSize } from '../../geometry/units';
import { DisplayUnits } from '../../model/plan.model';
import { PlanFileService } from '../../persistence/plan-file.service';
import { PLAN_REPOSITORY } from '../../persistence/plan-repository';
import { Preview3d } from '../../preview3d/preview3d';
import { Icon } from '../../shared/icon';
import { EditorActions } from '../../state/editor-actions';
import { EditorStore, ViewMode } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { isTypingTarget, PlanCanvas } from '../canvas/plan-canvas';
import { PropertiesPanel } from '../properties/properties-panel';
import { Toolbox } from '../toolbox/toolbox';

const AUTOSAVE_DELAY_MS = 1000;

type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

@Component({
  selector: 'app-editor-page',
  imports: [PlanCanvas, Toolbox, PropertiesPanel, Preview3d, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.css',
  host: {
    '(window:keydown)': 'onKeyDown($event)',
    '(window:beforeunload)': 'flushSave()',
  },
})
export class EditorPage {
  /** Route parameter. */
  readonly id = input.required<string>();

  protected readonly planStore = inject(PlanStore);
  protected readonly editor = inject(EditorStore);
  private readonly actions = inject(EditorActions);
  private readonly repo = inject(PLAN_REPOSITORY);
  private readonly files = inject(PlanFileService);
  private readonly router = inject(Router);
  private readonly canvas = viewChild(PlanCanvas);

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly saveStatus = signal<SaveStatus>('saved');
  protected readonly importError = signal<string | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedRevision = -1;

  protected readonly hint = computed(() => this.canvas()?.hint() ?? '');
  protected readonly cursorText = computed(() => {
    const p = this.editor.cursorWorld();
    if (!p) return '';
    const u = this.planStore.units();
    return `${formatLength(p.x, u)}, ${formatLength(p.y, u)}`;
  });
  protected readonly selectionText = computed(() => {
    const n = this.editor.selection().length;
    return n ? `${n} selected` : '';
  });

  protected readonly viewModes: { id: ViewMode; label: string; icon: string }[] = [
    { id: '2d', label: 'Plan', icon: 'plan' },
    { id: 'split', label: 'Split', icon: 'split' },
    { id: '3d', label: '3D', icon: 'cube' },
  ];

  protected readonly shortcuts: [string, string][] = [
    ['V', 'Select tool'],
    ['W', 'Wall tool'],
    ['D', 'Door tool'],
    ['N', 'Window tool'],
    ['H / hold Space', 'Pan'],
    ['Scroll', 'Zoom'],
    ['F', 'Fit plan to screen'],
    ['3', 'Cycle plan / split / 3D'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
    ['Delete', 'Delete selection'],
    ['Ctrl+D', 'Duplicate furniture'],
    ['R / Shift+R', 'Rotate furniture 90°'],
    ['Arrows', 'Nudge furniture (Shift for larger steps)'],
    ['Ctrl+A', 'Select all'],
    ['Shift (drawing)', 'Lock walls to 90°'],
    ['Alt (dragging)', 'Turn off snapping'],
    ['Type a number', 'Set exact wall length while drawing, then Enter'],
    ['Esc', 'Finish wall / cancel / deselect'],
  ];

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });

    effect(() => {
      const rev = this.planStore.revision();
      untracked(() => {
        if (this.state() === 'ready' && rev !== this.loadedRevision) this.scheduleSave();
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.flushSave();
      this.editor.clearSelection();
      this.editor.clearOverlay();
    });
  }

  private async load(id: string): Promise<void> {
    this.flushSave();
    this.state.set('loading');
    try {
      const plan = await this.repo.get(id);
      if (!plan) {
        this.state.set('missing');
        return;
      }
      this.planStore.load(plan);
      this.loadedRevision = this.planStore.revision();
      this.editor.clearSelection();
      this.editor.clearOverlay();
      this.editor.tool.set(plan.walls.length ? 'select' : 'wall');
      this.saveStatus.set('saved');
      this.state.set('ready');
      this.editor.requestFit();
    } catch (e) {
      this.loadError.set((e as Error).message);
      this.state.set('error');
    }
  }

  private scheduleSave(): void {
    this.saveStatus.set('pending');
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), AUTOSAVE_DELAY_MS);
  }

  private async save(): Promise<void> {
    this.saveTimer = null;
    this.saveStatus.set('saving');
    try {
      await this.repo.save(this.planStore.plan());
      if (!this.saveTimer) this.saveStatus.set('saved');
    } catch (e) {
      console.error(e);
      this.saveStatus.set('error');
    }
  }

  protected flushSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      void this.save();
    }
  }

  protected rename(name: string): void {
    name = name.trim();
    if (!name || name === this.planStore.plan().name) return;
    this.planStore.update((d) => {
      d.name = name;
    });
  }

  protected setUnits(units: DisplayUnits): void {
    if (units === this.planStore.units()) return;
    this.planStore.update((d) => {
      d.displayUnits = units;
    });
  }

  protected exportPlan(): void {
    this.files.export(this.planStore.plan());
  }

  protected async importPlan(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    try {
      this.flushSave();
      const plan = await this.files.import(file);
      this.importError.set(null);
      await this.router.navigate(['/plan', plan.id]);
    } catch (e) {
      this.importError.set((e as Error).message);
    }
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (this.state() !== 'ready') return;
    if (e.key === 'Escape' && this.editor.showHelp()) {
      this.editor.showHelp.set(false);
      return;
    }
    if (isTypingTarget(e.target)) return;
    if (this.canvas()?.handleToolKey(e)) {
      e.preventDefault();
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const step = e.shiftKey ? gridSize(this.planStore.units()) * 4 : gridSize(this.planStore.units()) / 6;
    let handled = true;

    if (ctrl && key === 'z' && !e.shiftKey) this.planStore.undo();
    else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) this.planStore.redo();
    else if (ctrl && key === 'd') this.actions.duplicateSelection();
    else if (ctrl && key === 'a') this.actions.selectAll();
    else if (ctrl) handled = false;
    else if (e.altKey) handled = false;
    else if (key === 'v') this.editor.tool.set('select');
    else if (key === 'w') this.editor.tool.set('wall');
    else if (key === 'd') this.editor.tool.set('door');
    else if (key === 'n') this.editor.tool.set('window');
    else if (key === 'h') this.editor.tool.set('pan');
    else if (key === 'f') this.editor.requestFit();
    else if (key === '3') this.cycleView();
    else if (key === 'r') this.actions.rotateSelection(e.shiftKey ? -90 : 90);
    else if (key === 'delete' || key === 'backspace') this.actions.deleteSelection();
    else if (key === 'escape') this.editor.clearSelection();
    else if (key === '?') this.editor.showHelp.update((v) => !v);
    else if (key === 'arrowleft') this.actions.nudgeSelection(-step, 0);
    else if (key === 'arrowright') this.actions.nudgeSelection(step, 0);
    else if (key === 'arrowup') this.actions.nudgeSelection(0, -step);
    else if (key === 'arrowdown') this.actions.nudgeSelection(0, step);
    else handled = false;

    if (handled) e.preventDefault();
  }

  private cycleView(): void {
    const order: ViewMode[] = ['2d', 'split', '3d'];
    this.editor.viewMode.update((m) => order[(order.indexOf(m) + 1) % order.length]);
  }

  protected inputValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
