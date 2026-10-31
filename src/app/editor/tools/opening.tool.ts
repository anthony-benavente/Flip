import { clampOpeningOffset, nearestWall } from '../../geometry/wall-geometry';
import { DEFAULT_DOOR, DEFAULT_WINDOW } from '../../model/defaults';
import { newId, OpeningKind } from '../../model/plan.model';
import { Tool, ToolContext, ToolPointerEvent } from './tool';

/** Places a door or window on the wall under the cursor. */
export class OpeningTool implements Tool {
  readonly cursor = 'copy';
  readonly hint: string;

  constructor(
    private readonly ctx: ToolContext,
    readonly id: 'door' | 'window',
  ) {
    this.hint = `Hover a wall and click to add a ${id} · Esc to cancel`;
  }

  private get kind(): OpeningKind {
    return this.id;
  }

  private get defaults() {
    return this.kind === 'door' ? DEFAULT_DOOR : DEFAULT_WINDOW;
  }

  private target(e: ToolPointerEvent) {
    const hit = nearestWall(this.ctx.plan.segments(), e.world, this.ctx.tolerance() * 2);
    if (!hit) return null;
    const width = Math.min(this.defaults.width, hit.seg.length);
    let offset = hit.offset;
    if (!e.alt) offset = Math.round(offset / this.ctx.grid()) * this.ctx.grid();
    return { seg: hit.seg, offset: clampOpeningOffset(offset, width, hit.seg.length), width };
  }

  onPointerMove(e: ToolPointerEvent): void {
    const t = this.target(e);
    this.ctx.editor.setOverlay({
      openingPreview: t ? { wallId: t.seg.wall.id, offset: t.offset, width: t.width, kind: this.kind } : null,
    });
  }

  onPointerDown(e: ToolPointerEvent): void {
    if (e.button !== 0) return;
    const t = this.target(e);
    if (!t) return;
    const id = newId('o');
    const d = this.defaults;
    this.ctx.plan.update((draft) => {
      draft.openings.push({
        id,
        wallId: t.seg.wall.id,
        kind: this.kind,
        offset: t.offset,
        width: t.width,
        height: Math.min(d.height, t.seg.wall.height - d.sillHeight),
        sillHeight: d.sillHeight,
        ...(this.kind === 'door' ? { swing: 'left' as const, flip: false } : {}),
      });
    });
    this.ctx.setTool('select');
    this.ctx.editor.select([{ kind: 'opening', id }]);
  }

  onPointerUp(): void {}

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.ctx.setTool('select');
      return true;
    }
    return false;
  }

  cancel(): void {
    this.ctx.editor.setOverlay({ openingPreview: null });
  }
}
