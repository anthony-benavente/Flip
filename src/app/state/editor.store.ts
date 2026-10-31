import { computed, Injectable, signal } from '@angular/core';
import { SnapGuide, SnapKind } from '../geometry/snapping';
import { DEFAULT_WALL_HEIGHT, DEFAULT_WALL_THICKNESS } from '../model/defaults';
import { Size, Viewport } from '../geometry/viewport';
import { Point, WallSide } from '../model/plan.model';

export type ToolId = 'select' | 'wall' | 'door' | 'window' | 'pan';
export type ViewMode = '2d' | 'split' | '3d';
export type SelectableKind = 'node' | 'wall' | 'opening' | 'furniture' | 'room';

export interface SelectionItem {
  kind: SelectableKind;
  /** Element id; for rooms, the room key. */
  id: string;
}

/** The wall face shown in the elevation view. */
export interface ElevationTarget {
  wallId: string;
  side: WallSide;
}

/** Transient drawing state shown by the canvas overlay layer. */
export interface ToolOverlay {
  /** Wall tool: points placed so far and the live cursor point. */
  wallChain?: Point[];
  wallCursor?: Point | null;
  /** Typed length buffer while drawing a wall. */
  typedLength?: string;
  /** Selection rectangle in world space. */
  box?: { a: Point; b: Point } | null;
  /** Door/window placement preview. */
  openingPreview?: { wallId: string; offset: number; width: number; kind: 'door' | 'window' } | null;
  /** Snap feedback. */
  snapPoint?: Point | null;
  snapKind?: SnapKind;
  guides?: SnapGuide[];
  /** Distances from a dragged furniture item to walls. */
  measures?: { from: Point; to: Point }[];
}

@Injectable({ providedIn: 'root' })
export class EditorStore {
  readonly tool = signal<ToolId>('select');
  readonly selection = signal<SelectionItem[]>([]);
  readonly hover = signal<SelectionItem | null>(null);
  readonly viewport = signal<Viewport>({ x: 0, y: 0, zoom: 1 });
  /** Size of the 2D canvas in px, published by the canvas component. */
  readonly canvasSize = signal<Size>({ width: 800, height: 600 });
  readonly viewMode = signal<ViewMode>('2d');
  /**
   * Wall face open in the elevation view, shown beside the plan in place of the 3D preview.
   * Closing it returns to the current view mode.
   */
  readonly elevation = signal<ElevationTarget | null>(null);
  readonly overlay = signal<ToolOverlay>({});
  readonly cursorWorld = signal<Point | null>(null);
  readonly showHelp = signal(false);
  /** Defaults for newly drawn walls. */
  readonly wallThickness = signal(DEFAULT_WALL_THICKNESS);
  readonly wallHeight = signal(DEFAULT_WALL_HEIGHT);
  /** Set by the canvas so other components can ask it to zoom to fit. */
  readonly fitRequest = signal(0);

  readonly selectedIds = computed(() => new Set(this.selection().map((s) => `${s.kind}:${s.id}`)));
  readonly singleSelection = computed(() => (this.selection().length === 1 ? this.selection()[0] : null));

  isSelected(kind: SelectableKind, id: string): boolean {
    return this.selectedIds().has(`${kind}:${id}`);
  }

  select(items: SelectionItem[]): void {
    this.selection.set(items);
  }

  toggle(item: SelectionItem): void {
    const cur = this.selection();
    const exists = cur.some((s) => s.kind === item.kind && s.id === item.id);
    this.selection.set(exists ? cur.filter((s) => !(s.kind === item.kind && s.id === item.id)) : [...cur, item]);
  }

  clearSelection(): void {
    if (this.selection().length) this.selection.set([]);
  }

  setOverlay(patch: Partial<ToolOverlay>): void {
    this.overlay.update((o) => ({ ...o, ...patch }));
  }

  clearOverlay(): void {
    this.overlay.set({});
  }

  /** Plan → split → 3D → plan. */
  cycleViewMode(): void {
    const order: ViewMode[] = ['2d', 'split', '3d'];
    this.viewMode.update((m) => order[(order.indexOf(m) + 1) % order.length]);
  }

  openElevation(wallId: string, side: WallSide): void {
    this.elevation.set({ wallId, side });
  }

  closeElevation(): void {
    this.elevation.set(null);
  }

  requestFit(): void {
    this.fitRequest.update((n) => n + 1);
  }
}
