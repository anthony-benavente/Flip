/** Which walls to cut down so the camera can see into the rooms ("dollhouse" view). Pure math. */

export interface Vec2 {
  x: number;
  y: number;
}

/** Height a cut wall is reduced to, as a fraction of its full height. */
export const CUTAWAY_SCALE = 0.12;

/**
 * True when a wall should be cut for a camera looking at `center` from `camera` (ground-plane
 * positions plus the camera's height above the center). Walls whose face points toward the camera
 * are cut, except those along the back of the plan; nothing is cut when looking almost straight down.
 *
 * @param mid wall midpoint on the ground plane
 * @param normal unit wall normal on the ground plane
 * @param extent largest horizontal size of the plan
 */
export function isWallCut(mid: Vec2, normal: Vec2, center: Vec2, camera: Vec2, cameraHeight: number, extent: number): boolean {
  let cx = camera.x - center.x;
  let cy = camera.y - center.y;
  const horizontal = Math.hypot(cx, cy);
  if (horizontal < 1e-3 || cameraHeight > horizontal * 2.5) return false;
  cx /= horizontal;
  cy /= horizontal;
  const tx = mid.x - center.x;
  const ty = mid.y - center.y;
  // Normal pointing away from the plan's center.
  const sign = normal.x * tx + normal.y * ty >= 0 ? 1 : -1;
  const facing = Math.abs(sign * (normal.x * cx + normal.y * cy));
  const along = tx * cx + ty * cy;
  return facing > 0.35 && along > -0.15 * extent;
}
