import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatLength } from '../../geometry/units';
import { DisplayUnits } from '../../model/plan.model';
import { PlanFileService } from '../../persistence/plan-file.service';
import { PLAN_REPOSITORY } from '../../persistence/plan-repository';
import { Preview3d } from '../../preview3d/preview3d';
import { WallElevation } from '../elevation/wall-elevation';
import { Icon } from '../../shared/icon';
import { EditorActions } from '../../state/editor-actions';
import { EditorStore, ViewMode } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { clampSidebarWidth, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_STEP, saveSidebarWidth } from '../../state/sidebar-width';
import { isTypingTarget } from '../../shared/dom';
import { ToastService } from '../../shared/toast';
import { HelpDialog } from '../help-dialog';
import { Autosave } from '../autosave';
import { ConsultSession } from '../../consult/consult-session';
import { PLAN_SNAPSHOT } from '../../consult/snapshot';
import { loadPlanSnapshotter } from '../plan-snapshotter';
import { ModelRenderQueue } from '../model-render-queue';
import { PlanCanvas } from '../canvas/plan-canvas';
import { PropertiesPanel } from '../properties/properties-panel';
import { findShortcut } from '../shortcuts';
import { Toolbox } from '../toolbox/toolbox';

@Component({
  selector: 'app-editor-page',
  imports: [HelpDialog, PlanCanvas, Toolbox, PropertiesPanel, Preview3d, WallElevation, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.css',
  providers: [Autosave, ConsultSession, ModelRenderQueue, { provide: PLAN_SNAPSHOT, useValue: loadPlanSnapshotter }],
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
  private readonly elevationView = viewChild(WallElevation);
  private readonly autosave = inject(Autosave);
  private readonly toast = inject(ToastService);
  /** Created with the page so `window.flip` exists whenever the editor is open, not only once the Consult tab is. */
  private readonly consult = inject(ConsultSession);
  /** Draws the plan top views and thumbnails of uploaded models while the editor is open. */
  private readonly modelRenders = inject(ModelRenderQueue);

  protected readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly saveStatus = this.autosave.status;
  protected readonly importError = signal<string | null>(null);

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

  constructor() {
    effect(() => saveSidebarWidth(this.editor.sidebarWidth()));
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });

    inject(DestroyRef).onDestroy(() => {
      this.editor.clearSelection();
      this.editor.clearOverlay();
    });
  }

  private async load(id: string): Promise<void> {
    this.autosave.stop();
    this.state.set('loading');
    try {
      const plan = await this.repo.get(id);
      if (!plan) {
        this.state.set('missing');
        return;
      }
      this.planStore.load(plan);
      this.autosave.start();
      this.editor.clearSelection();
      this.editor.clearOverlay();
      this.editor.tool.set(plan.walls.length ? 'select' : 'wall');
      this.state.set('ready');
      this.editor.requestFit();
    } catch (e) {
      this.loadError.set((e as Error).message);
      this.state.set('error');
    }
  }

  /** Saves any pending change now (leaving the page, importing another plan). */
  protected flushSave(): void {
    this.autosave.flush();
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
    this.toast.show(`Exported “${this.planStore.plan().name}”`);
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
      this.toast.show(`Imported “${plan.name}”`);
    } catch (e) {
      this.importError.set((e as Error).message);
    }
  }

  protected readonly sidebarMin = SIDEBAR_MIN;
  protected readonly sidebarMax = SIDEBAR_MAX;
  private dragFrom: { x: number; width: number } | null = null;

  protected startResize(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.dragFrom = { x: e.clientX, width: this.editor.sidebarWidth() };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  protected resize(e: PointerEvent): void {
    if (this.dragFrom) this.editor.sidebarWidth.set(clampSidebarWidth(this.dragFrom.width + e.clientX - this.dragFrom.x));
  }

  protected endResize(): void {
    this.dragFrom = null;
  }

  protected resizeKey(e: KeyboardEvent): void {
    // Arrow keys move the divider, not the selected furniture behind it.
    e.stopPropagation();
    const step = { ArrowLeft: -SIDEBAR_STEP, ArrowRight: SIDEBAR_STEP }[e.key];
    if (step === undefined && e.key !== 'Home') return;
    e.preventDefault();
    this.editor.sidebarWidth.set(step === undefined ? SIDEBAR_DEFAULT : clampSidebarWidth(this.editor.sidebarWidth() + step));
  }

  protected resetWidth(): void {
    this.editor.sidebarWidth.set(SIDEBAR_DEFAULT);
  }

  protected onKeyDown(e: KeyboardEvent): void {
    if (this.state() !== 'ready') return;
    if (e.key === 'Escape' && this.editor.showHelp()) {
      this.editor.showHelp.set(false);
      return;
    }
    if (isTypingTarget(e.target)) return;
    if (this.elevationView()?.handleKey(e) || this.canvas()?.handleToolKey(e)) {
      e.preventDefault();
      return;
    }
    const shortcut = findShortcut(e);
    if (!shortcut) return;
    shortcut.run({ plan: this.planStore, editor: this.editor, actions: this.actions }, e);
    e.preventDefault();
  }

  protected inputValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
