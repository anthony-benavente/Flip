import { describe, expect, it } from 'vitest';
import { Opening, Point } from '../model/plan.model';
import { Obstacle, walkMove, walkObstacles, walkStart, WALK_RADIUS } from './walk';
import { WallSegment } from './wall-geometry';

function wall(id: string, a: { x: number; y: number }, b: { x: number; y: number }, type?: 'railing' | 'hidden'): WallSegment {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  return { wall: { id, a: 'a', b: 'b', thickness: 10, height: 250, type }, a, b, length, dir, normal: { x: -dir.y, y: dir.x } };
}

/** Walks in 5 cm steps, as frames would. */
function walk(from: Point, delta: Point, obstacles: Obstacle[]): Point {
  const steps = Math.ceil(Math.hypot(delta.x, delta.y) / 5);
  let p = from;
  for (let i = 0; i < steps; i++) p = walkMove(p, { x: delta.x / steps, y: delta.y / steps }, obstacles);
  return p;
}

describe('walk', () => {
  const along = wall('w1', { x: 0, y: 0 }, { x: 400, y: 0 });

  it('stops the body at a wall and slides along it', () => {
    const obstacles = walkObstacles([along], []);
    const p = walk({ x: 200, y: 40 }, { x: 10, y: -50 }, obstacles);
    expect(p.y).toBeCloseTo(5 + WALK_RADIUS, 5);
    expect(p.x).toBeCloseTo(210, 5);
  });

  it('lets the body through a doorway but not past a window sill', () => {
    const door: Opening = { id: 'd', wallId: 'w1', kind: 'door', offset: 200, width: 90, height: 200, sillHeight: 0 };
    const window: Opening = { id: 'n', wallId: 'w1', kind: 'window', offset: 200, width: 90, height: 100, sillHeight: 90 };
    const through = (o: Opening) => walk({ x: 200, y: 40 }, { x: 0, y: -80 }, walkObstacles([along], [o])).y;
    expect(through(door)).toBeLessThan(0);
    expect(through(window)).toBeGreaterThan(0);
  });

  it('blocks at railings and ignores hidden dividers', () => {
    const rail = walkObstacles([wall('r', { x: 0, y: 0 }, { x: 400, y: 0 }, 'railing')], []);
    expect(walk({ x: 200, y: 40 }, { x: 0, y: -80 }, rail).y).toBeGreaterThan(0);
    const hidden = walkObstacles([wall('h', { x: 0, y: 0 }, { x: 400, y: 0 }, 'hidden')], []);
    expect(hidden).toEqual([]);
  });

  it('pushes a body that starts inside a wall out of it', () => {
    const p = walkMove({ x: 200, y: 1 }, { x: 0, y: 0 }, walkObstacles([along], []));
    expect(Math.abs(p.y)).toBeCloseTo(5 + WALK_RADIUS, 5);
  });

  it('starts in the preferred room, else the biggest', () => {
    const rooms = [
      { key: 'a', area: 10, label: { x: 1, y: 1 } },
      { key: 'b', area: 30, label: { x: 2, y: 2 } },
    ] as Parameters<typeof walkStart>[0];
    expect(walkStart(rooms)).toEqual({ x: 2, y: 2 });
    expect(walkStart(rooms, 'a')).toEqual({ x: 1, y: 1 });
    expect(walkStart([])).toEqual({ x: 0, y: 0 });
  });
});
