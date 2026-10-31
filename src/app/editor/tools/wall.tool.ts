import { parseLength } from '../../geometry/units';
import { snapPoint } from '../../geometry/snapping';
import { add, dist, normalize, projectToSegment, scale, sub } from '../../geometry/vec';
import { addWall } from '../../geometry/wall-geometry';
import { Point } from '../../model/plan.model';
import { Tool, ToolContext, ToolPointerEvent } from './tool';

const LENGTH_CHARS = /^[0-9.,'" ]$|^[a-z]$/i;

/** Click to place wall corners; double-click or Esc to finish; click the first corner to close. */
export class WallTool implements Tool {
  readonly id = 'wall' as const;
  readonly cursor = 'crosshair';
  readonly hint = 'Click to place corners · ends when you reach an existing wall · type a length + Enter · Shift for 90° · Alt disables snapping · Esc to finish';

  private chain: Point[] = [];
  private cursorPoint: Point | null = null;
  private typed = '';

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;
    const p = this.snap(e).point;
    this.place(p);
  }

  onPointerMove(e: ToolPointerEvent): void {
    const snap = this.snap(e);
    this.cursorPoint = snap.point;
    this.ctx.editor.setOverlay({
      wallChain: [...this.chain],
      wallCursor: snap.point,
      snapPoint: snap.kind === 'grid' || snap.kind === 'none' ? null : snap.point,
      snapKind: snap.kind,
      guides: snap.guides,
      typedLength: this.typed,
    });
  }

  onPointerUp(): void {}

  onDoubleClick(): void {
    this.finish();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      if (this.typed) {
        this.typed = '';
        this.refreshOverlay();
      } else if (this.chain.length) {
        this.finish();
      } else {
        this.ctx.setTool('select');
      }
      return true;
    }
    if (!this.chain.length || e.ctrlKey || e.metaKey) return false;
    if (e.key === 'Enter') {
      this.applyTyped();
      return true;
    }
    if (e.key === 'Backspace') {
      if (this.typed) {
        this.typed = this.typed.slice(0, -1);
      } else if (this.chain.length > 1) {
        // Remove the last segment drawn in this chain.
        this.ctx.plan.undo();
        this.chain.pop();
      } else {
        this.chain = [];
      }
      this.refreshOverlay();
      return true;
    }
    // Start a typed length on a digit; once started, accept unit characters too.
    if ((this.typed || /^[0-9.]$/.test(e.key)) && e.key.length === 1 && LENGTH_CHARS.test(e.key)) {
      this.typed += e.key;
      this.refreshOverlay();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.chain = [];
    this.typed = '';
    this.cursorPoint = null;
    this.ctx.editor.clearOverlay();
  }

  private snap(e: ToolPointerEvent) {
    const plan = this.ctx.plan.plan();
    return snapPoint(e.world, plan, {
      tolerance: this.ctx.tolerance(),
      grid: this.ctx.grid(),
      from: this.chain.at(-1) ?? null,
      orthogonal: e.shift,
      disabled: e.alt,
    });
  }

  private place(p: Point): void {
    const last = this.chain.at(-1);
    if (!last) {
      this.chain = [p];
      this.refreshOverlay();
      return;
    }
    if (dist(last, p) < 1) return;
    // Ending on existing walls (a corner or a point along a wall) closes off a space, so the chain stops there.
    const joinsExisting = this.touchesExistingWall(p);
    const editor = this.ctx.editor;
    this.ctx.plan.update((draft) => {
      addWall(draft, last, p, { thickness: editor.wallThickness(), height: editor.wallHeight() });
    });
    if (joinsExisting) {
      this.finish();
    } else {
      this.chain.push(p);
      this.typed = '';
      this.refreshOverlay();
    }
  }

  private touchesExistingWall(p: Point): boolean {
    const plan = this.ctx.plan.plan();
    if (plan.nodes.some((n) => dist(n, p) < 1)) return true;
    return this.ctx.plan.segments().some((s) => projectToSegment(p, s.a, s.b).distance < 1);
  }

  private applyTyped(): void {
    const last = this.chain.at(-1);
    const length = parseLength(this.typed, this.ctx.plan.units());
    if (!last || length === null || length <= 0) {
      this.typed = '';
      this.refreshOverlay();
      return;
    }
    let dir = this.cursorPoint ? normalize(sub(this.cursorPoint, last)) : { x: 1, y: 0 };
    if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };
    this.typed = '';
    const p = add(last, scale(dir, length));
    this.cursorPoint = p;
    this.place(p);
  }

  private finish(): void {
    this.chain = [];
    this.typed = '';
    this.ctx.editor.setOverlay({ wallChain: [], typedLength: '' });
  }

  private refreshOverlay(): void {
    this.ctx.editor.setOverlay({ wallChain: [...this.chain], wallCursor: this.cursorPoint, typedLength: this.typed });
  }
}
