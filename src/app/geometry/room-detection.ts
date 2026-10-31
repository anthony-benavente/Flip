import { DEFAULT_FLOOR_COLOR, DEFAULT_WALL_COLOR } from '../model/palettes';
import { Plan, Point, RoomMeta, WallSide } from '../model/plan.model';
import { add, labelPoint, pointInPolygon, polygonArea, scale } from './vec';
import type { WallSegment } from './wall-geometry';

export interface DetectedRoom {
  /** Stable for a given wall loop: sorted wall ids joined. */
  key: string;
  polygon: Point[];
  nodeIds: string[];
  wallIds: string[];
  /** Area in square centimeters (measured on wall centerlines). */
  area: number;
  label: Point;
}

export interface Room extends DetectedRoom {
  meta: RoomMeta | null;
  name: string;
  floorColor: string;
  wallColor: string;
}


/** Faces smaller than this (about 1 sq ft) are ignored. */
const MIN_ROOM_AREA = 900;

/**
 * Finds enclosed rooms as the bounded faces of the planar wall graph.
 * Assumes walls only meet at shared nodes (the editor splits walls at crossings).
 */
export function detectRooms(plan: Pick<Plan, 'nodes' | 'walls'>): DetectedRoom[] {
  const pos = new Map(plan.nodes.map((n) => [n.id, n]));
  // Adjacency: node -> neighbors sorted by angle, plus the wall id for each edge.
  const adj = new Map<string, { to: string; wall: string; angle: number }[]>();
  const seenEdges = new Set<string>();
  for (const w of plan.walls) {
    const a = pos.get(w.a);
    const b = pos.get(w.b);
    if (!a || !b || w.a === w.b) continue;
    const k = w.a < w.b ? `${w.a}|${w.b}` : `${w.b}|${w.a}`;
    if (seenEdges.has(k)) continue;
    seenEdges.add(k);
    push(adj, w.a, { to: w.b, wall: w.id, angle: Math.atan2(b.y - a.y, b.x - a.x) });
    push(adj, w.b, { to: w.a, wall: w.id, angle: Math.atan2(a.y - b.y, a.x - b.x) });
  }
  for (const list of adj.values()) list.sort((p, q) => p.angle - q.angle);

  const visited = new Set<string>();
  const rooms: DetectedRoom[] = [];

  for (const [start, list] of adj) {
    for (const first of list) {
      const startKey = `${start}>${first.to}`;
      if (visited.has(startKey)) continue;

      const nodeIds: string[] = [];
      const wallIds: string[] = [];
      let u = start;
      let e = first;
      let guard = 0;
      while (guard++ < 10000) {
        const key = `${u}>${e.to}`;
        if (visited.has(key)) break;
        visited.add(key);
        nodeIds.push(u);
        wallIds.push(e.wall);
        // At e.to, pick the neighbor just before u in angular order: the tightest left turn.
        const v = e.to;
        const out = adj.get(v)!;
        const idx = out.findIndex((o) => o.to === u);
        const next = out[(idx - 1 + out.length) % out.length];
        u = v;
        e = next;
      }

      const polygon = nodeIds.map((id) => ({ x: pos.get(id)!.x, y: pos.get(id)!.y }));
      const area = polygonArea(polygon);
      // Bounded faces trace with positive signed area; the outer face is negative.
      if (area < MIN_ROOM_AREA) continue;
      const uniqueWalls = [...new Set(wallIds)];
      rooms.push({
        key: [...uniqueWalls].sort().join(','),
        polygon,
        nodeIds,
        wallIds: uniqueWalls,
        area,
        label: labelPoint(polygon),
      });
    }
  }
  return rooms;
}

/** Attaches stored room metadata (name, colors) to detected rooms by anchor containment. */
export function attachRoomMeta(detected: DetectedRoom[], metas: RoomMeta[]): Room[] {
  const used = new Set<string>();
  // Smaller rooms first so a meta anchor inside a nested room binds to the inner one.
  const order = [...detected].sort((a, b) => a.area - b.area);
  const result = new Map<DetectedRoom, Room>();
  for (const r of order) {
    const meta = metas.find((m) => !used.has(m.id) && pointInPolygon(m.anchor, r.polygon)) ?? null;
    if (meta) used.add(meta.id);
    result.set(r, {
      ...r,
      meta,
      name: meta?.name ?? 'Room',
      floorColor: meta?.floorColor ?? DEFAULT_FLOOR_COLOR,
      wallColor: meta?.wallColor ?? DEFAULT_WALL_COLOR,
    });
  }
  return detected.map((r) => result.get(r)!);
}

/** Returns the room containing a point, preferring the smallest. */
export function roomAt(rooms: Room[], p: Point): Room | null {
  let best: Room | null = null;
  for (const r of rooms) {
    if (pointInPolygon(p, r.polygon) && (!best || r.area < best.area)) best = r;
  }
  return best;
}

/** The room on each face of a wall, or null where that face is outside every room. */
export function roomsBesideWall(seg: WallSegment, rooms: Room[]): Record<WallSide, Room | null> {
  const mid = add(seg.a, scale(seg.dir, seg.length / 2));
  const probe = (sign: number) => roomAt(rooms, add(mid, scale(seg.normal, sign * (seg.wall.thickness / 2 + 5))));
  return { front: probe(1), back: probe(-1) };
}

/** Paint color of one wall face: its accent override, else the room's wall color, else null (exterior). */
export function wallFaceColor(seg: WallSegment, side: WallSide, room: Room | null): string | null {
  return seg.wall.colors?.[side] ?? room?.wallColor ?? null;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}
