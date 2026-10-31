import { CM_PER_FOOT, CM_PER_INCH } from '../geometry/units';
import { addWall } from '../geometry/wall-geometry';
import { catalogItem, mountOf } from './catalog';
import { CURRENT_SCHEMA_VERSION, DisplayUnits, FurnitureItem, newId, Plan, Point } from './plan.model';

export const DEFAULT_WALL_THICKNESS = 4.5 * CM_PER_INCH;
export const DEFAULT_WALL_HEIGHT = 8 * CM_PER_FOOT;

export const DEFAULT_DOOR = { width: 32 * CM_PER_INCH, height: 80 * CM_PER_INCH, sillHeight: 0 };
export const DEFAULT_WINDOW = { width: 36 * CM_PER_INCH, height: 48 * CM_PER_INCH, sillHeight: 36 * CM_PER_INCH };

export function createEmptyPlan(name = 'Untitled plan', units: DisplayUnits = 'imperial'): Plan {
  return {
    id: newId('p'),
    name,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    displayUnits: units,
    nodes: [],
    walls: [],
    openings: [],
    furniture: [],
    rooms: [],
  };
}

export function createFurniture(catalogId: string, at: Point, rotation = 0): FurnitureItem {
  const c = catalogItem(catalogId);
  const item: FurnitureItem = {
    id: newId('f'),
    catalogId: c.id,
    x: at.x,
    y: at.y,
    rotation,
    width: c.width,
    depth: c.depth,
    height: c.height,
    color: c.color,
  };
  if (mountOf(c) === 'wall') item.elevation = Math.max(0, (c.defaultElevation ?? 0) - c.height / 2);
  return item;
}

/** A closed 12' x 14' room with a door and a window, as a starting point. */
export function createStarterPlan(name = 'My room', units: DisplayUnits = 'imperial'): Plan {
  const plan = createEmptyPlan(name, units);
  const w = 12 * CM_PER_FOOT;
  const h = 14 * CM_PER_FOOT;
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const props = { thickness: DEFAULT_WALL_THICKNESS, height: DEFAULT_WALL_HEIGHT };
  const wallIds: string[] = [];
  for (let i = 0; i < 4; i++) wallIds.push(...addWall(plan, corners[i], corners[(i + 1) % 4], props).wallIds);

  // Door on the bottom wall, window on the top wall.
  plan.openings.push({
    id: newId('o'),
    wallId: wallIds[2],
    kind: 'door',
    offset: 3 * CM_PER_FOOT,
    ...DEFAULT_DOOR,
    swing: 'left',
  });
  plan.openings.push({ id: newId('o'), wallId: wallIds[0], kind: 'window', offset: w / 2, ...DEFAULT_WINDOW });
  plan.rooms.push({
    id: newId('r'),
    anchor: { x: w / 2, y: h / 2 },
    name: 'Living room',
    floorColor: '#c9a77c',
    wallColor: '#efe9df',
  });
  return plan;
}
