import { Tool, ToolContext } from './tool';

/** Panning is handled by the canvas itself; this tool only marks the mode. */
export class PanTool implements Tool {
  readonly id = 'pan' as const;
  readonly cursor = 'grab';
  readonly hint = 'Drag to pan · scroll to zoom · hold Space with any tool to pan';

  constructor(private readonly ctx: ToolContext) {}

  onPointerDown(): void {}
  onPointerMove(): void {}
  onPointerUp(): void {}

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.ctx.setTool('select');
      return true;
    }
    return false;
  }

  cancel(): void {}
}
