/**
 * The commands an AI (or any script) can send to edit a plan. All lengths are centimeters and
 * all angles degrees, with plan y pointing down. Each one builds on the same operations the
 * editor's own tools use, so a command can never leave the document in a state the UI cannot.
 */
import { itemElevation, restingElevation } from '../geometry/elevation';
import { findOverlaps, snapFurnitureToWall } from '../geometry/furniture-geometry';
import { attachRoomMeta, detectRooms, Room, roomAt, roomsBesideWall } from '../geometry/room-detection';
import { addWall, clampOpeningOffset, removeWalls, wallSegments } from '../geometry/wall-geometry';
import { CATALOG, CATALOG_CATEGORIES, mountOf } from '../model/catalog';
import {
  createFurniture,
  DEFAULT_DOOR,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  DEFAULT_WINDOW,
} from '../model/defaults';
import {
  FLOOR_MATERIALS,
  ACCENT_SWATCHES,
  CEILING_SWATCHES,
  DOOR_SWATCHES,
  FLOOR_SWATCHES,
  FURNITURE_SWATCHES,
  ROOM_SCHEMES,
  schemeFinishes,
  TRIM_SWATCHES,
  WALL_SWATCHES,
} from '../model/palettes';
import {
  moveOnWall,
  RoomPatch,
  setFurnitureArt,
  setFurnitureModel,
  setRoomCeilingHeight,
  setWallColor,
  setWallType,
  updateFurniture,
  updateOpening,
  updateWall,
  upsertRoomMeta,
} from '../model/plan-operations';
import { FloorMaterial, newId, Plan } from '../model/plan.model';
import { ArtImage } from '../model/art-image';
import { CustomModel } from '../model/custom-model';
import { Command, CommandContext, CommandError } from './command';
import { ObjectSchema, Schema } from './schema';

const round = (n: number) => Math.round(n * 10) / 10;
const rounded = (p: { x: number; y: number }) => ({ x: round(p.x), y: round(p.y) });

const color = (description: string): Schema => ({ type: 'string', pattern: '#[0-9a-fA-F]{6}', description: `${description} A #rrggbb color.` });
const length = (description: string, minimum = 0, maximum = 5000): Schema => ({ type: 'number', description: `${description} In centimeters.`, minimum, maximum });
const text = (description: string, values?: readonly string[]): Schema => ({ type: 'string', description, ...(values && { enum: values }) });
const object = (properties: Record<string, Schema>, required: string[] = []): ObjectSchema => ({ type: 'object', properties, required });

const FLOOR_MATERIAL_IDS = FLOOR_MATERIALS.map((m) => m.id);
const SCHEME_NAMES = ROOM_SCHEMES.map((s) => s.name);
const CATALOG_IDS = CATALOG.map((c) => c.id);

function derive(draft: Plan) {
  return { rooms: attachRoomMeta(detectRooms(draft), draft.rooms), segs: wallSegments(draft) };
}

function findRoom(rooms: Room[], ref: string): Room {
  const byKey = rooms.find((r) => r.key === ref);
  if (byKey) return byKey;
  const byName = rooms.filter((r) => r.name.toLowerCase() === ref.toLowerCase());
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new CommandError(`Several rooms are named "${ref}". Use a room key: ${byName.map((r) => r.key).join(', ')}.`);
  throw new CommandError(`No room "${ref}". Rooms: ${rooms.map((r) => `${r.name} (${r.key})`).join(', ') || 'none yet'}.`);
}

function findWall(draft: Plan, id: string) {
  const wall = draft.walls.find((w) => w.id === id);
  if (!wall) throw new CommandError(`No wall "${id}". Call get_plan to see wall ids.`);
  return wall;
}

function findOpening(draft: Plan, id: string) {
  const opening = draft.openings.find((o) => o.id === id);
  if (!opening) throw new CommandError(`No door or window "${id}". Call get_plan to see ids.`);
  return opening;
}

function findItem(draft: Plan, id: string) {
  const item = draft.furniture.find((f) => f.id === id);
  if (!item) throw new CommandError(`No furniture "${id}". Call get_plan to see ids.`);
  return item;
}

function catalogEntry(id: string) {
  const entry = CATALOG.find((c) => c.id === id);
  if (!entry) throw new CommandError(`Unknown catalogId "${id}". Call list_catalog for the valid ids.`);
  return entry;
}

const ART_SHAPES = ['art', 'canvas-art'];

function isArt(catalogId: string): boolean {
  const shape = CATALOG.find((c) => c.id === catalogId)?.shape;
  return !!shape && ART_SHAPES.includes(shape);
}

/** The uploaded model, if it exists and was made for this catalog item. */
function usableModel(ctx: CommandContext, modelId: string, catalogId: string): CustomModel {
  const model = ctx.models.find((m) => m.id === modelId);
  if (!model) throw new CommandError(`No uploaded model "${modelId}". Call list_uploads for the valid ids.`);
  if (model.catalogId !== catalogId) {
    throw new CommandError(`"${model.name}" was uploaded as a ${catalogEntry(model.catalogId).name}, so it only fits that item, not a ${catalogEntry(catalogId).name}.`);
  }
  return model;
}

function uploadedImage(ctx: CommandContext, imageId: string): ArtImage {
  const image = ctx.images.find((i) => i.id === imageId);
  if (!image) throw new CommandError(`No uploaded picture "${imageId}". Call list_uploads for the valid ids.`);
  return image;
}

/** The fields of an item that a command may set directly. */
function itemPatch(args: Record<string, any>) {
  const patch: Record<string, unknown> = {};
  for (const key of ['x', 'y', 'rotation', 'width', 'depth', 'height', 'elevation', 'color', 'label']) {
    if (args[key] !== undefined) patch[key] = args[key];
  }
  return patch;
}

const ITEM_FIELDS: Record<string, Schema> = {
  rotation: { type: 'number', description: 'Degrees clockwise on the plan. 0 puts the front of the item toward plan +y (down).', minimum: -360, maximum: 360 },
  width: length('Width along the item\'s left-right axis.', 5),
  depth: length('Depth from back to front.', 5),
  height: length('Height of the item.', 2, 600),
  color: color('Main color of the item.'),
  label: text('A short name shown on the plan.'),
};

export const PLAN_COMMANDS: Command[] = [
  {
    name: 'get_plan',
    description:
      'Reads the whole plan: rooms (with finishes and bounds), walls (with the rooms on each face), doors and windows, furniture, and which furniture overlaps. Call this first and after bigger changes.',
    readOnly: true,
    input: object({}),
    run(draft) {
      const { rooms, segs } = derive(draft);
      const overlaps = findOverlaps(draft.furniture, segs, (f) => itemElevation(f, rooms));
      const xs = rooms.flatMap((r) => r.polygon.map((p) => p.x));
      const ys = rooms.flatMap((r) => r.polygon.map((p) => p.y));
      return {
        summary: 'Read the plan',
        output: {
          name: draft.name,
          displayUnits: draft.displayUnits,
          note: 'All lengths are centimeters; angles are degrees; y points down the page.',
          rooms: rooms.map((r) => ({
            key: r.key,
            name: r.name,
            areaSquareMeters: round(r.area / 10000),
            bounds: { minX: round(Math.min(...r.polygon.map((p) => p.x))), minY: round(Math.min(...r.polygon.map((p) => p.y))), maxX: round(Math.max(...r.polygon.map((p) => p.x))), maxY: round(Math.max(...r.polygon.map((p) => p.y))) },
            polygon: r.polygon.map(rounded),
            ceilingHeight: round(r.ceilingHeight),
            wallColor: r.wallColor,
            floorColor: r.floorColor,
            floorMaterial: r.floorMaterial,
            ceilingColor: r.ceilingColor,
            trimColor: r.trimColor,
            crownMolding: r.crownMolding,
          })),
          walls: segs.map((s) => {
            const beside = roomsBesideWall(s, rooms);
            return {
              id: s.wall.id,
              from: rounded(s.a),
              to: rounded(s.b),
              length: round(s.length),
              height: s.wall.height,
              thickness: s.wall.thickness,
              type: s.wall.type ?? 'solid',
              accentColors: s.wall.colors,
              frontRoom: beside.front?.name ?? null,
              backRoom: beside.back?.name ?? null,
            };
          }),
          openings: draft.openings.map((o) => ({ ...o, offset: round(o.offset) })),
          furniture: draft.furniture.map((f) => ({
            id: f.id,
            catalogId: f.catalogId,
            label: f.label,
            x: round(f.x),
            y: round(f.y),
            rotation: round(f.rotation),
            width: round(f.width),
            depth: round(f.depth),
            height: round(f.height),
            elevation: round(itemElevation(f, rooms)),
            color: f.color,
            modelId: f.modelId,
            artImageId: f.artImageId,
            room: roomAt(rooms, f)?.name ?? null,
            overlapping: overlaps.has(f.id),
          })),
          planBounds: xs.length ? { minX: round(Math.min(...xs)), minY: round(Math.min(...ys)), maxX: round(Math.max(...xs)), maxY: round(Math.max(...ys)) } : null,
        },
      };
    },
  },
  {
    name: 'list_catalog',
    description:
      'Lists the furniture, decor and lighting you can place, with default sizes and how each mounts (floor, wall or ceiling). modelIds lists the user\'s uploaded 3D models made for that item.',
    readOnly: true,
    input: object({ category: text('Only items in this category.', CATALOG_CATEGORIES) }),
    run(_draft, args, ctx) {
      const items = CATALOG.filter((c) => !args['category'] || c.category === args['category']);
      return {
        summary: 'Read the catalog',
        output: items.map((c) => ({
          catalogId: c.id,
          name: c.name,
          category: c.category,
          mount: mountOf(c),
          width: round(c.width),
          depth: round(c.depth),
          height: round(c.height),
          stackable: c.stackable ?? false,
          ...(ctx.models.some((m) => m.catalogId === c.id) && { modelIds: ctx.models.filter((m) => m.catalogId === c.id).map((m) => m.id) }),
        })),
      };
    },
  },
  {
    name: 'list_palettes',
    description: 'Lists the ready-made room color schemes, floor materials and named paint swatches. Colors you pass to other commands may be any #rrggbb value.',
    readOnly: true,
    input: object({}),
    run() {
      const swatches = (list: { name: string; color: string }[]) => list.map((s) => ({ name: s.name, color: s.color }));
      return {
        summary: 'Read the palettes',
        output: {
          schemes: ROOM_SCHEMES.map((s) => ({ name: s.name, floorColor: s.floorColor, floorMaterial: s.floorMaterial, wallColor: s.wallColor, ceilingColor: s.ceilingColor, trimColor: s.trimColor, suggestedAccentWall: s.accent })),
          floorMaterials: FLOOR_MATERIAL_IDS,
          floor: swatches(FLOOR_SWATCHES),
          wall: swatches(WALL_SWATCHES),
          accentWall: swatches(ACCENT_SWATCHES),
          ceiling: swatches(CEILING_SWATCHES),
          trim: swatches(TRIM_SWATCHES),
          door: swatches(DOOR_SWATCHES),
          furniture: swatches(FURNITURE_SWATCHES).map((s) => s.color),
        },
      };
    },
  },
  {
    name: 'list_uploads',
    description:
      'Lists the 3D models and pictures the user uploaded. A model fits only the catalog item it was uploaded for (catalogId). A picture can go on any framed art item. You cannot see the files, so choose by name, and leave them alone when none fits.',
    readOnly: true,
    input: object({}),
    run(_draft, _args, ctx) {
      return {
        summary: 'Read the uploads',
        output: {
          models: ctx.models.map((m) => ({ modelId: m.id, name: m.name, catalogId: m.catalogId, templateName: catalogEntry(m.catalogId).name })),
          pictures: ctx.images.map((i) => ({ imageId: i.id, name: i.name, widthPx: i.width, heightPx: i.height })),
        },
      };
    },
  },
  {
    name: 'check_layout',
    description: 'Finds problems in the furniture layout: items overlapping each other or a wall, and floor items outside every room. Call it before you finish.',
    readOnly: true,
    input: object({}),
    run(draft) {
      const { rooms, segs } = derive(draft);
      const overlaps = findOverlaps(draft.furniture, segs, (f) => itemElevation(f, rooms));
      const name = (id: string) => {
        const f = draft.furniture.find((x) => x.id === id)!;
        return `${f.label ?? f.catalogId} (${id})`;
      };
      const outside = draft.furniture.filter((f) => mountOf(CATALOG.find((c) => c.id === f.catalogId) ?? CATALOG[0]) === 'floor' && !roomAt(rooms, f));
      const overlapping = [...overlaps].map(name);
      const outsideRooms = outside.map((f) => name(f.id));
      return {
        summary: 'Checked the layout',
        output: { ok: !overlapping.length && !outsideRooms.length, overlapping, outsideRooms },
      };
    },
  },
  {
    name: 'add_room',
    description: 'Draws a rectangular room from four walls. (x, y) is the top-left corner. Walls that touch existing walls are joined to them.',
    input: object(
      {
        x: length('Left edge.', -10000, 10000),
        y: length('Top edge.', -10000, 10000),
        width: length('Size along x.', 60),
        depth: length('Size along y.', 60),
        name: text('Room name, such as "Living room".'),
        wallHeight: length('Wall height (the ceiling). Defaults to 240 cm.', 180, 600),
      },
      ['x', 'y', 'width', 'depth'],
    ),
    run(draft, a) {
      const props = { thickness: DEFAULT_WALL_THICKNESS, height: a['wallHeight'] ?? DEFAULT_WALL_HEIGHT };
      const corners = [
        { x: a['x'], y: a['y'] },
        { x: a['x'] + a['width'], y: a['y'] },
        { x: a['x'] + a['width'], y: a['y'] + a['depth'] },
        { x: a['x'], y: a['y'] + a['depth'] },
      ];
      const wallIds: string[] = [];
      for (let i = 0; i < 4; i++) wallIds.push(...addWall(draft, corners[i], corners[(i + 1) % 4], props).wallIds);
      const center = { x: a['x'] + a['width'] / 2, y: a['y'] + a['depth'] / 2 };
      const room = roomAt(derive(draft).rooms, center);
      if (room && a['name']) upsertRoomMeta(draft, room, { name: a['name'] });
      return {
        summary: `Drew ${a['name'] ?? 'a room'} (${round(a['width'])} × ${round(a['depth'])} cm)`,
        output: { roomKey: room?.key ?? null, wallIds },
      };
    },
  },
  {
    name: 'add_wall',
    description: 'Draws one straight wall. It joins and splits walls it touches or crosses. Closed loops of walls become rooms.',
    input: object(
      {
        x1: length('Start x.', -10000, 10000),
        y1: length('Start y.', -10000, 10000),
        x2: length('End x.', -10000, 10000),
        y2: length('End y.', -10000, 10000),
        height: length('Wall height. Defaults to 240 cm.', 30, 600),
        thickness: length('Wall thickness. Defaults to 10 cm.', 2, 100),
      },
      ['x1', 'y1', 'x2', 'y2'],
    ),
    run(draft, a) {
      const { wallIds } = addWall(draft, { x: a['x1'], y: a['y1'] }, { x: a['x2'], y: a['y2'] }, { thickness: a['thickness'] ?? DEFAULT_WALL_THICKNESS, height: a['height'] ?? DEFAULT_WALL_HEIGHT });
      if (!wallIds.length) throw new CommandError('That wall is too short or already exists.');
      return { summary: `Drew a wall`, output: { wallIds } };
    },
  },
  {
    name: 'remove_wall',
    description: 'Deletes a wall and the doors and windows on it.',
    input: object({ wallId: text('Id of the wall.') }, ['wallId']),
    run(draft, a) {
      findWall(draft, a['wallId']);
      removeWalls(draft, [a['wallId']]);
      return { summary: 'Removed a wall' };
    },
  },
  {
    name: 'update_wall',
    description:
      'Changes a wall: height, thickness, type, or paint on one face. A face with no paint uses its room\'s wall color. Use frontRoom/backRoom from get_plan to pick the face. Changing the height of a room\'s walls changes its ceiling.',
    input: object(
      {
        wallId: text('Id of the wall.'),
        height: length('Wall height.', 30, 600),
        thickness: length('Wall thickness.', 2, 100),
        type: text('solid is a normal wall, railing is an open 90 cm railing, hidden is an invisible room divider.', ['solid', 'railing', 'hidden']),
        frontColor: { type: 'string', description: 'Accent paint for the front face, a #rrggbb color, or "none" to clear it.' },
        backColor: { type: 'string', description: 'Accent paint for the back face, a #rrggbb color, or "none" to clear it.' },
      },
      ['wallId'],
    ),
    run(draft, a) {
      findWall(draft, a['wallId']);
      for (const key of ['frontColor', 'backColor']) {
        const v = a[key];
        if (v !== undefined && v !== 'none' && !/^#[0-9a-fA-F]{6}$/.test(v)) throw new CommandError(`${key} must be a #rrggbb color or "none".`);
      }
      const patch: { height?: number; thickness?: number } = {};
      if (a['height'] !== undefined) patch.height = a['height'];
      if (a['thickness'] !== undefined) patch.thickness = a['thickness'];
      if (Object.keys(patch).length) updateWall(draft, a['wallId'], patch);
      if (a['type'] !== undefined) setWallType(draft, a['wallId'], a['type'] === 'solid' ? null : a['type']);
      if (a['frontColor'] !== undefined) setWallColor(draft, a['wallId'], 'front', a['frontColor'] === 'none' ? null : a['frontColor']);
      if (a['backColor'] !== undefined) setWallColor(draft, a['wallId'], 'back', a['backColor'] === 'none' ? null : a['backColor']);
      return { summary: 'Updated a wall' };
    },
  },
  {
    name: 'add_opening',
    description: 'Adds a door or window to a solid wall. offset is the distance from the wall\'s start (`from` in get_plan) to the opening\'s center.',
    input: object(
      {
        wallId: text('Id of the wall.'),
        kind: text('door or window.', ['door', 'window']),
        offset: length('Distance along the wall to the center.', 0, 10000),
        width: length('Opening width. Defaults to 81 cm for a door, 91 cm for a window.', 30, 500),
        height: length('Opening height.', 30, 400),
        sillHeight: length('Height of the bottom edge above the floor. 0 for doors.', 0, 400),
        swing: text('Which side a door is hinged on, seen from the wall start.', ['left', 'right']),
        color: color('Door paint.'),
      },
      ['wallId', 'kind', 'offset'],
    ),
    run(draft, a) {
      const wall = findWall(draft, a['wallId']);
      if (wall.type) throw new CommandError(`A ${wall.type} wall cannot have doors or windows.`);
      const seg = derive(draft).segs.find((s) => s.wall.id === wall.id);
      if (!seg) throw new CommandError('That wall has no length.');
      const defaults = a['kind'] === 'door' ? DEFAULT_DOOR : DEFAULT_WINDOW;
      const width = Math.min(a['width'] ?? defaults.width, seg.length);
      const sillHeight = a['sillHeight'] ?? defaults.sillHeight;
      const id = newId('o');
      draft.openings.push({
        id,
        wallId: wall.id,
        kind: a['kind'],
        offset: clampOpeningOffset(a['offset'], width, seg.length),
        width,
        height: Math.min(a['height'] ?? defaults.height, Math.max(10, wall.height - sillHeight)),
        sillHeight,
        ...(a['kind'] === 'door' ? { swing: a['swing'] ?? 'left', flip: false } : {}),
        ...(a['color'] && a['kind'] === 'door' ? { color: a['color'] } : {}),
      });
      return { summary: `Added a ${a['kind']}`, output: { openingId: id } };
    },
  },
  {
    name: 'update_opening',
    description: 'Moves, resizes or repaints a door or window.',
    input: object(
      {
        openingId: text('Id of the door or window.'),
        offset: length('Distance along the wall to the center.', 0, 10000),
        width: length('Opening width.', 30, 500),
        height: length('Opening height.', 30, 400),
        sillHeight: length('Height of the bottom edge above the floor.', 0, 400),
        swing: text('Which side a door is hinged on.', ['left', 'right']),
        flip: { type: 'boolean', description: 'Makes a door open to the other side of the wall.' },
        color: color('Door paint.'),
      },
      ['openingId'],
    ),
    run(draft, a) {
      findOpening(draft, a['openingId']);
      const { openingId: _id, ...patch } = a;
      updateOpening(draft, a['openingId'], patch);
      return { summary: 'Updated a door or window' };
    },
  },
  {
    name: 'remove_opening',
    description: 'Deletes a door or window.',
    input: object({ openingId: text('Id of the door or window.') }, ['openingId']),
    run(draft, a) {
      findOpening(draft, a['openingId']);
      draft.openings = draft.openings.filter((o) => o.id !== a['openingId']);
      return { summary: 'Removed a door or window' };
    },
  },
  {
    name: 'place_furniture',
    description:
      'Places a floor item, or a ceiling item such as a light, with its center at (x, y). When rotation is left out and the item is near a wall, it is pushed flush against the wall with its back to it. Small stackable items land on the furniture under them. For art, mirrors and other wall items use hang_on_wall.',
    input: object(
      {
        catalogId: text('An id from list_catalog.', CATALOG_IDS),
        x: length('Center x.', -10000, 10000),
        y: length('Center y.', -10000, 10000),
        ...ITEM_FIELDS,
        elevation: length('Height of the bottom above the floor. Normally leave it out.', 0, 600),
        modelId: text('An uploaded 3D model for this item, from list_uploads. Leave out for the built-in look.'),
      },
      ['catalogId', 'x', 'y'],
    ),
    run(draft, a, ctx) {
      const entry = catalogEntry(a['catalogId']);
      if (mountOf(entry) === 'wall') throw new CommandError(`${entry.name} hangs on a wall. Use hang_on_wall.`);
      const model = a['modelId'] ? usableModel(ctx, a['modelId'], entry.id) : undefined;
      const { rooms, segs } = derive(draft);
      const item = createFurniture(entry.id, { x: a['x'], y: a['y'] }, a['rotation'] ?? 0);
      Object.assign(item, itemPatch({ ...a, x: undefined, y: undefined, rotation: undefined, elevation: undefined }));
      if (model) item.modelId = model.id;
      if (a['rotation'] === undefined && !entry.noWallSnap && mountOf(entry) === 'floor') {
        const snapped = snapFurnitureToWall({ x: a['x'], y: a['y'] }, item, segs, 45, true);
        if (snapped) Object.assign(item, snapped);
      }
      if (a['elevation'] !== undefined) item.elevation = a['elevation'];
      else if (entry.stackable) {
        const resting = restingElevation(item, draft.furniture, rooms);
        if (resting > 0) item.elevation = resting;
      }
      draft.furniture.push(item);
      updateFurniture(draft, item.id, { rotation: item.rotation });
      const room = roomAt(rooms, item);
      return {
        summary: `Placed ${a['label'] ?? entry.name}${room ? ` in ${room.name}` : ''}`,
        output: { id: item.id, x: round(item.x), y: round(item.y), rotation: round(item.rotation) },
      };
    },
  },
  {
    name: 'hang_on_wall',
    description: 'Hangs a wall item (art, mirror, shelf, TV, sconce) on one face of a wall, flush against it. along is measured from the wall\'s start (`from`).',
    input: object(
      {
        catalogId: text('An id from list_catalog whose mount is wall.', CATALOG.filter((c) => mountOf(c) === 'wall').map((c) => c.id)),
        wallId: text('Id of the wall.'),
        side: text('front or back: which face of the wall. frontRoom/backRoom in get_plan name the room on each face.', ['front', 'back']),
        along: length('Distance along the wall to the item\'s center.', 0, 10000),
        bottom: length('Height of the item\'s bottom above the floor. Defaults to the item\'s usual hanging height.', 0, 600),
        color: ITEM_FIELDS['color'],
        label: ITEM_FIELDS['label'],
        width: ITEM_FIELDS['width'],
        height: ITEM_FIELDS['height'],
        imageId: text('An uploaded picture to show on framed art, from list_uploads. The frame is resized to the picture\'s proportions.'),
      },
      ['catalogId', 'wallId', 'side', 'along'],
    ),
    run(draft, a, ctx) {
      const entry = catalogEntry(a['catalogId']);
      if (mountOf(entry) !== 'wall') throw new CommandError(`${entry.name} does not hang on walls. Use place_furniture.`);
      if (a['imageId'] && !isArt(entry.id)) throw new CommandError(`${entry.name} cannot show a picture. Use a framed print or canvas.`);
      const image = a['imageId'] ? uploadedImage(ctx, a['imageId']) : undefined;
      const wall = findWall(draft, a['wallId']);
      if (wall.type) throw new CommandError(`Nothing hangs on a ${wall.type} wall.`);
      const seg = derive(draft).segs.find((s) => s.wall.id === wall.id)!;
      const item = createFurniture(entry.id, seg.a);
      Object.assign(item, itemPatch({ color: a['color'], label: a['label'], width: a['width'], height: a['height'] }));
      draft.furniture.push(item);
      if (image) setFurnitureArt(draft, item.id, image.id, image.height / image.width);
      moveOnWall(draft, item.id, seg, a['side'], a['along'], a['bottom'] ?? item.elevation ?? 0);
      return { summary: `Hung ${a['label'] ?? entry.name} on a wall`, output: { id: item.id } };
    },
  },
  {
    name: 'update_furniture',
    description: 'Moves, turns, resizes or recolors an item. x and y are its center.',
    input: object(
      {
        id: text('Id of the furniture item.'),
        x: length('Center x.', -10000, 10000),
        y: length('Center y.', -10000, 10000),
        ...ITEM_FIELDS,
        elevation: length('Height of the bottom above the floor.', 0, 600),
      },
      ['id'],
    ),
    run(draft, a) {
      const item = findItem(draft, a['id']);
      updateFurniture(draft, a['id'], itemPatch(a));
      return { summary: `Updated ${item.label ?? catalogName(item.catalogId)}` };
    },
  },
  {
    name: 'set_furniture_model',
    description: 'Draws an item in 3D with one of the user\'s uploaded models (list_uploads), or with the built-in look when modelId is "none". The model must have been uploaded for the same catalog item.',
    input: object({ id: text('Id of the furniture item.'), modelId: text('An uploaded model id, or "none".') }, ['id', 'modelId']),
    run(draft, a, ctx) {
      const item = findItem(draft, a['id']);
      if (a['modelId'] === 'none') {
        setFurnitureModel(draft, item.id, undefined);
        return { summary: `Used the built-in look for ${item.label ?? catalogName(item.catalogId)}` };
      }
      const model = usableModel(ctx, a['modelId'], item.catalogId);
      setFurnitureModel(draft, item.id, model.id);
      return { summary: `Showed the ${model.name} model on ${item.label ?? catalogName(item.catalogId)}` };
    },
  },
  {
    name: 'set_furniture_art',
    description: 'Shows one of the user\'s uploaded pictures (list_uploads) on a framed print or canvas, or clears it when imageId is "none". By default the frame is resized to the picture\'s proportions.',
    input: object(
      {
        id: text('Id of the art item.'),
        imageId: text('An uploaded picture id, or "none".'),
        fitFrame: { type: 'boolean', description: 'Resize the frame height to the picture\'s proportions. Defaults to true.' },
      },
      ['id', 'imageId'],
    ),
    run(draft, a, ctx) {
      const item = findItem(draft, a['id']);
      if (!isArt(item.catalogId)) throw new CommandError(`${item.label ?? catalogName(item.catalogId)} is not framed art, so it cannot show a picture.`);
      if (a['imageId'] === 'none') {
        setFurnitureArt(draft, item.id, undefined);
        return { summary: `Cleared the picture on ${item.label ?? catalogName(item.catalogId)}` };
      }
      const image = uploadedImage(ctx, a['imageId']);
      setFurnitureArt(draft, item.id, image.id, a['fitFrame'] === false ? undefined : image.height / image.width);
      return { summary: `Showed "${image.name}" on ${item.label ?? catalogName(item.catalogId)}` };
    },
  },
  {
    name: 'remove_furniture',
    description: 'Deletes a furniture item.',
    input: object({ id: text('Id of the furniture item.') }, ['id']),
    run(draft, a) {
      const item = findItem(draft, a['id']);
      draft.furniture = draft.furniture.filter((f) => f.id !== a['id']);
      return { summary: `Removed ${item.label ?? catalogName(item.catalogId)}` };
    },
  },
  {
    name: 'set_room',
    description:
      'Renames a room or sets its finishes: a ready-made color scheme (from list_palettes) and/or individual colors, floor material, crown molding and ceiling height. Individual values override the scheme.',
    input: object(
      {
        room: text('The room\'s name or key.'),
        name: text('New room name.'),
        scheme: text('A color scheme applied to floor, walls, ceiling and trim together.', SCHEME_NAMES),
        wallColor: color('Wall paint.'),
        floorColor: color('Floor color.'),
        floorMaterial: text('Floor surface pattern.', FLOOR_MATERIAL_IDS),
        ceilingColor: color('Ceiling paint.'),
        trimColor: color('Baseboards, crown molding and door and window casings.'),
        crownMolding: { type: 'boolean', description: 'Adds crown molding where walls meet the ceiling.' },
        ceilingHeight: length('Ceiling height. Sets every wall around the room, so a shared wall changes for its neighbor too.', 180, 600),
      },
      ['room'],
    ),
    run(draft, a) {
      const room = findRoom(derive(draft).rooms, a['room']);
      const patch: RoomPatch = {};
      if (a['scheme']) Object.assign(patch, schemeFinishes(ROOM_SCHEMES.find((s) => s.name === a['scheme'])!));
      for (const key of ['name', 'wallColor', 'floorColor', 'ceilingColor', 'trimColor', 'crownMolding'] as const) {
        if (a[key] !== undefined) (patch as Record<string, unknown>)[key] = a[key];
      }
      if (a['floorMaterial'] !== undefined) patch.floorMaterial = a['floorMaterial'] as FloorMaterial;
      if (Object.keys(patch).length) upsertRoomMeta(draft, room, patch);
      if (a['ceilingHeight'] !== undefined) setRoomCeilingHeight(draft, room, a['ceilingHeight']);
      return { summary: `Updated ${a['name'] ?? room.name}${a['scheme'] ? ` with the ${a['scheme']} scheme` : ''}` };
    },
  },
];

function catalogName(id: string): string {
  return CATALOG.find((c) => c.id === id)?.name ?? id;
}
