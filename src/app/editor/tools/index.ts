import { ToolId } from '../../state/editor.store';
import { OpeningTool } from './opening.tool';
import { PanTool } from './pan.tool';
import { SelectTool } from './select.tool';
import { Tool, ToolContext } from './tool';
import { WallTool } from './wall.tool';

/** One instance of every editing tool, sharing a context. */
export function createTools(ctx: ToolContext): Record<ToolId, Tool> {
  return {
    select: new SelectTool(ctx),
    wall: new WallTool(ctx),
    door: new OpeningTool(ctx, 'door'),
    window: new OpeningTool(ctx, 'window'),
    pan: new PanTool(ctx),
  };
}
