import { roomAt, attachRoomMeta, detectRooms } from '../geometry/room-detection';
import { createEmptyPlan } from '../model/defaults';
import { Plan } from '../model/plan.model';
import { CommandCall } from './command';
import { commandSpecs, runCommand } from './run-command';
import { validate } from './schema';

function run(plan: Plan, name: string, args?: unknown) {
  return runCommand(plan, { name, args } satisfies CommandCall);
}

function ok(plan: Plan, name: string, args?: unknown): any {
  const r = run(plan, name, args);
  if (!r.ok) throw new Error(`${name} failed: ${r.error}`);
  return r.output;
}

function roomPlan(): Plan {
  const plan = createEmptyPlan();
  ok(plan, 'add_room', { x: 0, y: 0, width: 400, depth: 300, name: 'Living room' });
  return plan;
}

describe('validate', () => {
  it('reports the first problem in plain words', () => {
    const schema = commandSpecs().find((c) => c.name === 'place_furniture')!.inputSchema;
    expect(validate(schema, { catalogId: 'sofa-3', x: 1, y: 2 })).toBeNull();
    expect(validate(schema, { x: 1, y: 2 })).toContain('catalogId is required');
    expect(validate(schema, { catalogId: 'sofa-3', x: 'a', y: 2 })).toContain('x must be a number');
    expect(validate(schema, { catalogId: 'nope', x: 1, y: 2 })).toContain('catalogId must be one of');
    expect(validate(schema, { catalogId: 'sofa-3', x: 1, y: 2, colour: '#fff' })).toContain('not a known property');
    expect(validate(schema, { catalogId: 'sofa-3', x: 1, y: 2, color: 'red' })).toContain('color must match');
  });

  it('offers every command as a tool with a snake_case name', () => {
    for (const spec of commandSpecs()) {
      expect(spec.name).toMatch(/^[a-z_]+$/);
      expect(spec.description.length).toBeGreaterThan(10);
      expect(spec.inputSchema.type).toBe('object');
    }
  });
});

describe('runCommand', () => {
  it('rejects unknown commands and bad arguments without touching the plan', () => {
    const plan = roomPlan();
    const before = structuredClone(plan);
    expect(run(plan, 'explode')).toMatchObject({ ok: false });
    expect(run(plan, 'add_room', { x: 0, y: 0, width: 10, depth: 300 })).toMatchObject({ ok: false });
    expect(run(plan, 'remove_wall', { wallId: 'nope' })).toMatchObject({ ok: false });
    expect(plan).toEqual(before);
  });

  it('draws a named room that is detected as a room', () => {
    const plan = roomPlan();
    expect(plan.walls).toHaveLength(4);
    const rooms = attachRoomMeta(detectRooms(plan), plan.rooms);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].name).toBe('Living room');
    expect(rooms[0].area).toBeCloseTo(400 * 300);
  });

  it('places furniture flush against a nearby wall, and refuses wall items', () => {
    const plan = roomPlan();
    const out = ok(plan, 'place_furniture', { catalogId: 'sofa-3', x: 200, y: 40 });
    const sofa = plan.furniture.find((f) => f.id === out.id)!;
    expect(sofa.y).toBeGreaterThan(5);
    expect(sofa.y).toBeLessThan(60);
    const wallItem = run(plan, 'place_furniture', { catalogId: 'art-medium', x: 100, y: 100 });
    expect(wallItem.ok).toBe(false);
  });

  it('keeps an explicit rotation instead of snapping', () => {
    const plan = roomPlan();
    const out = ok(plan, 'place_furniture', { catalogId: 'sofa-3', x: 200, y: 40, rotation: 90 });
    expect(plan.furniture.find((f) => f.id === out.id)!.rotation).toBe(90);
  });

  it('hangs wall decor on a wall face', () => {
    const plan = roomPlan();
    const wall = plan.walls[0];
    const out = ok(plan, 'hang_on_wall', { catalogId: 'art-medium', wallId: wall.id, side: 'front', along: 200 });
    const art = plan.furniture.find((f) => f.id === out.id)!;
    expect(art.elevation).toBeGreaterThan(0);
    expect(run(plan, 'hang_on_wall', { catalogId: 'sofa-3', wallId: wall.id, side: 'front', along: 200 }).ok).toBe(false);
  });

  it('adds doors and windows and keeps them on the wall', () => {
    const plan = roomPlan();
    const wall = plan.walls[0];
    ok(plan, 'add_opening', { wallId: wall.id, kind: 'door', offset: 5 });
    ok(plan, 'add_opening', { wallId: wall.id, kind: 'window', offset: 300 });
    expect(plan.openings).toHaveLength(2);
    expect(plan.openings[0].offset).toBeGreaterThan(5);
    expect(plan.openings[0].swing).toBe('left');
    const railing = ok(plan, 'add_room', { x: 500, y: 0, width: 200, depth: 200 });
    ok(plan, 'update_wall', { wallId: railing.wallIds[0], type: 'railing' });
    expect(run(plan, 'add_opening', { wallId: railing.wallIds[0], kind: 'door', offset: 100 }).ok).toBe(false);
  });

  it('applies a color scheme to a room and lets single colors override it', () => {
    const plan = roomPlan();
    ok(plan, 'set_room', { room: 'living room', scheme: 'Moody', wallColor: '#112233', crownMolding: true, ceilingHeight: 300 });
    const room = attachRoomMeta(detectRooms(plan), plan.rooms)[0];
    expect(room.wallColor).toBe('#112233');
    expect(room.floorMaterial).toBe('wood');
    expect(room.crownMolding).toBe(true);
    expect(room.ceilingHeight).toBe(300);
    expect(run(plan, 'set_room', { room: 'Kitchen', scheme: 'Moody' }).ok).toBe(false);
  });

  it('paints one face of a wall', () => {
    const plan = roomPlan();
    const id = plan.walls[0].id;
    ok(plan, 'update_wall', { wallId: id, frontColor: '#2f4a6d' });
    expect(plan.walls[0].colors).toEqual({ front: '#2f4a6d' });
    ok(plan, 'update_wall', { wallId: id, frontColor: 'none' });
    expect(plan.walls[0].colors).toBeUndefined();
  });

  it('updates and removes furniture', () => {
    const plan = roomPlan();
    const { id } = ok(plan, 'place_furniture', { catalogId: 'sofa-3', x: 200, y: 150, rotation: 0 });
    ok(plan, 'update_furniture', { id, x: 250, color: '#5f8a4f', label: 'Couch' });
    expect(plan.furniture[0]).toMatchObject({ x: 250, color: '#5f8a4f', label: 'Couch' });
    ok(plan, 'remove_furniture', { id });
    expect(plan.furniture).toHaveLength(0);
  });

  it('reads the plan, catalog and palettes, and finds layout problems', () => {
    const plan = roomPlan();
    ok(plan, 'place_furniture', { catalogId: 'sofa-3', x: 200, y: 150, rotation: 0 });
    ok(plan, 'place_furniture', { catalogId: 'sofa-3', x: 210, y: 150, rotation: 0 });
    ok(plan, 'place_furniture', { catalogId: 'sofa-3', x: 1500, y: 1500, rotation: 0 });
    const view = ok(plan, 'get_plan');
    expect(view.rooms[0]).toMatchObject({ name: 'Living room' });
    expect(view.walls).toHaveLength(4);
    expect(view.walls[0].frontRoom === 'Living room' || view.walls[0].backRoom === 'Living room').toBe(true);
    expect(view.furniture.filter((f: any) => f.overlapping)).toHaveLength(2);
    const check = ok(plan, 'check_layout');
    expect(check.ok).toBe(false);
    expect(check.overlapping).toHaveLength(2);
    expect(check.outsideRooms).toHaveLength(1);
    expect(ok(plan, 'list_catalog', { category: 'Seating' }).length).toBeGreaterThan(0);
    expect(ok(plan, 'list_palettes').schemes.length).toBeGreaterThan(0);
  });

  it('read-only commands do not change the plan', () => {
    const plan = roomPlan();
    const before = structuredClone(plan);
    for (const spec of commandSpecs().filter((c) => c.readOnly)) ok(plan, spec.name);
    expect(plan).toEqual(before);
    expect(roomAt(attachRoomMeta(detectRooms(plan), plan.rooms), { x: 200, y: 150 })).not.toBeNull();
  });
});
