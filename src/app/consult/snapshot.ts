import { InjectionToken } from '@angular/core';
import { Room } from '../geometry/room-detection';
import { WallSegment } from '../geometry/wall-geometry';
import { CustomModel } from '../model/custom-model';
import { Plan } from '../model/plan.model';
import { AiToolSpec } from './ai-provider';

/** `top` looks straight down, for judging the layout; `corner` is a three-quarter view with the near walls cut down, for judging color and decor. */
export type SnapshotView = 'top' | 'corner';

export interface SnapshotRequest {
  plan: Plan;
  rooms: Room[];
  segments: WallSegment[];
  /** Where uploaded models and pictures are found; the model and image libraries fit. */
  models: { model(id: string): CustomModel | undefined; bytes(id: string): Promise<ArrayBuffer | null> };
  images: { image(id: string): { mimeType: string } | undefined; bytes(id: string): Promise<ArrayBuffer | null> };
  view: SnapshotView;
  width: number;
  height: number;
}

/** Renders the plan and resolves with a JPEG data URL. Provided by the editor page, since it needs three.js. */
export type PlanSnapshotter = (request: SnapshotRequest) => Promise<string>;

export const PLAN_SNAPSHOT = new InjectionToken<PlanSnapshotter>('PLAN_SNAPSHOT', {
  providedIn: 'root',
  factory: () => async () => {
    throw new Error('Screenshots are not available here.');
  },
});

export const SNAPSHOT_SIZE = { width: 1024, height: 768 };

/** Which screenshots the AI may take: none, only the corner view (colors and decor), or both views (layout too). */
export type ScreenshotMode = 'off' | 'corner' | 'all';

export const SCREENSHOT_MODES: { id: ScreenshotMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'corner', label: 'Corner view only' },
  { id: 'all', label: 'Top and corner' },
];

export const VIEW_PLAN_NAME = 'view_plan';

/**
 * The screenshot tool for a mode, or null when screenshots are off. It is not a plan command: it
 * needs a renderer, so the session handles it.
 */
export function viewPlanTool(mode: ScreenshotMode): (AiToolSpec & { inputSchema: { type: 'object'; properties: object; required: string[] } }) | null {
  if (mode === 'off') return null;
  const views = mode === 'all' ? ['top', 'corner'] : ['corner'];
  return {
    name: VIEW_PLAN_NAME,
    description:
      `Takes a screenshot of the plan as it is now and shows it to you. ${
        mode === 'all'
          ? 'View "top" looks straight down, for judging the layout; "corner" is a three-quarter view for judging colors and decor.'
          : 'The "corner" view is a three-quarter view for judging colors and decor.'
      } Furniture is labeled with its name and the last four characters of its id (match them to get_plan), and rooms with their names. Use it after changing colors or decor, and fix what looks wrong.`,
    inputSchema: {
      type: 'object',
      properties: { view: { type: 'string', enum: views, description: views.join(' or ') + '.' } },
      required: ['view'],
    },
  };
}
