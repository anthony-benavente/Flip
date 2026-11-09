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

/** The one tool that is not a plan command: it needs a renderer, so the session handles it. */
export const VIEW_PLAN: AiToolSpec & { name: 'view_plan' } = {
  name: 'view_plan',
  description:
    'Takes a screenshot of the plan as it is now and shows it to you. view "top" looks straight down, for judging the layout; "corner" is a three-quarter view for judging colors and decor. Furniture is labeled with its name and the last four characters of its id (match them to get_plan), and rooms with their names. Use it after arranging furniture or changing colors, and fix what looks wrong.',
  inputSchema: {
    type: 'object',
    properties: { view: { type: 'string', enum: ['top', 'corner'], description: 'top or corner.' } },
    required: ['view'],
  },
};
