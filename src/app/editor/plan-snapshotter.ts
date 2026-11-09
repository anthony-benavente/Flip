import { PlanSnapshotter } from '../consult/snapshot';

/** Loads the renderer on first use, so three.js stays out of the main bundle. */
export const loadPlanSnapshotter: PlanSnapshotter = async (request) => (await import('../preview3d/plan-snapshot')).snapshotPlan(request);
