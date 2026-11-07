import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { walkStart } from '../geometry/walk';
import { ImageLibrary } from '../persistence/image-library';
import { ModelLibrary } from '../persistence/model-library';
import { EditorStore, SelectionItem } from '../state/editor.store';
import { PlanStore } from '../state/plan.store';
import { Icon } from '../shared/icon';
import type { CameraPreset, PreviewEngine } from './preview-engine';

const REBUILD_DEBOUNCE_MS = 150;

/** 3D view of the plan. Loads three.js on first use. */
@Component({
  selector: 'app-preview3d',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #host class="host"></div>
    @if (status() === 'loading') {
      <div class="message">Loading 3D view…</div>
    } @else if (status() === 'error') {
      <div class="message error">The 3D view could not start. Your browser may not support WebGL.</div>
    }
    <div class="controls">
      <button class="btn" [class.active]="preset() === 'perspective'" (click)="setCamera('perspective')" title="Corner view">
        <app-icon name="perspective" /> Corner
      </button>
      <button class="btn" [class.active]="preset() === 'top'" (click)="setCamera('top')" title="Top-down view">
        <app-icon name="top" /> Top
      </button>
      <button class="btn" [class.active]="walking()" (click)="toggleWalk()" title="Walk through the room at eye level">
        <app-icon name="walk" /> Walk
      </button>
      <label class="toggle" title="Fade walls that block the view">
        <input type="checkbox" [checked]="cutaway()" (change)="toggleCutaway()" /> Cutaway walls
      </label>
    </div>
    <div class="help">
      @if (walking()) {
        W A S D or arrows to move · drag to look · Shift to run · Esc to exit
      } @else {
        Click to select · drag to orbit · right-drag to pan · scroll to zoom
      }
    </div>
  `,
  styles: `
    :host { position: relative; display: block; overflow: hidden; background: #eef0f2; }
    .host { position: absolute; inset: 0; }
    .host ::ng-deep canvas { display: block; outline: none; }
    .message { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px;
      color: var(--text-muted); text-align: center; }
    .message.error { color: var(--danger); }
    .controls { position: absolute; top: 10px; left: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
      padding: 4px; border: 1px solid var(--border); border-radius: var(--radius); background: rgb(255 255 255 / 92%);
      box-shadow: var(--shadow); }
    .controls .btn { height: 28px; border-color: transparent; }
    .controls .btn.active { background: var(--accent-soft); color: var(--accent); }
    .toggle { display: flex; align-items: center; gap: 6px; padding: 0 8px; font-size: 13px; cursor: pointer; }
    .help { position: absolute; bottom: 10px; left: 10px; padding: 3px 8px; border-radius: var(--radius-sm);
      background: rgb(255 255 255 / 85%); color: var(--text-muted); font-size: 12px; pointer-events: none; }
  `,
})
export class Preview3d {
  private readonly store = inject(PlanStore);
  private readonly editor = inject(EditorStore);
  private readonly library = inject(ModelLibrary);
  private readonly images = inject(ImageLibrary);
  private readonly hostRef = viewChild.required<ElementRef<HTMLElement>>('host');
  private engine: PreviewEngine | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly preset = signal<CameraPreset>('perspective');
  protected readonly cutaway = signal(true);
  protected readonly walking = signal(false);

  constructor() {
    effect(() => {
      // Track everything the scene depends on.
      this.store.plan();
      this.store.rooms();
      this.store.segments();
      this.library.models();
      this.images.images();
      untracked(() => this.scheduleRebuild());
    });
    effect(() => {
      const selection = this.editor.selection();
      untracked(() => this.engine?.setSelection(selection));
    });

    afterNextRender(async () => {
      try {
        const { PreviewEngine } = await import('./preview-engine');
        if (this.destroyed) return;
        this.engine = new PreviewEngine(this.hostRef().nativeElement);
        this.engine.setCutaway(this.cutaway());
        this.engine.setSelection(this.editor.selection());
        this.engine.onPick = (item, additive) => this.pick(item, additive);
        this.engine.onWalkEnd = () => this.stopWalk();
        this.rebuild();
        this.status.set('ready');
      } catch (e) {
        console.error(e);
        this.status.set('error');
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (this.timer) clearTimeout(this.timer);
      this.engine?.dispose();
      this.engine = null;
    });
  }

  protected toggleWalk(): void {
    if (this.walking()) return this.stopWalk();
    if (!this.engine) return;
    const selected = this.editor.selection().find((s) => s.kind === 'room');
    this.engine.startWalk(walkStart(this.store.rooms(), selected?.id));
    this.walking.set(true);
  }

  private stopWalk(): void {
    this.engine?.stopWalk();
    this.walking.set(false);
  }

  protected setCamera(preset: CameraPreset): void {
    this.walking.set(false);
    this.preset.set(preset);
    this.engine?.setCamera(preset);
  }

  /** Click selects the element under the pointer; Shift/Ctrl-click adds or removes it. */
  private pick(item: SelectionItem | null, additive: boolean): void {
    if (!item) {
      if (!additive) this.editor.clearSelection();
    } else if (additive) {
      this.editor.toggle(item);
    } else {
      this.editor.select([item]);
    }
  }

  protected toggleCutaway(): void {
    this.cutaway.update((v) => !v);
    this.engine?.setCutaway(this.cutaway());
  }

  private scheduleRebuild(): void {
    if (!this.engine) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.rebuild(), REBUILD_DEBOUNCE_MS);
  }

  private rebuild(): void {
    this.timer = null;
    this.engine?.update(this.store.plan(), this.store.rooms(), this.store.segments(), this.library, this.images);
  }
}
