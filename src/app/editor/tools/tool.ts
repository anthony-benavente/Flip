import { Point } from '../../model/plan.model';
import { EditorStore, SelectableKind, ToolId } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';

export type HitKind = SelectableKind | 'handle';

/** What the pointer is over, read from `data-kind`/`data-id` attributes on SVG elements. */
export interface Hit {
  kind: HitKind;
  id: string;
  /** For handles: which handle ('rotate', 'e', 'w', 'n', 's'). */
  handle?: string;
}

export interface ToolPointerEvent {
  world: Point;
  screen: Point;
  hit: Hit | null;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  button: number;
}

export interface ToolContext {
  plan: PlanStore;
  editor: EditorStore;
  /** Snap tolerance in world units (a fixed number of screen pixels). */
  tolerance(): number;
  /** Grid spacing in cm for the current units. */
  grid(): number;
  setTool(id: ToolId): void;
}

export interface Tool {
  readonly id: ToolId;
  readonly cursor: string;
  readonly hint: string;
  onPointerDown(e: ToolPointerEvent): void;
  onPointerMove(e: ToolPointerEvent): void;
  onPointerUp(e: ToolPointerEvent): void;
  onDoubleClick?(e: ToolPointerEvent): void;
  /** Returns true when the key was handled and should not trigger global shortcuts. */
  onKeyDown?(e: KeyboardEvent): boolean;
  /** Abandons any in-progress action (tool switch, Esc). */
  cancel(): void;
}
