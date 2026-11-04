import { Opening } from '../model/plan.model';
import { RAILING, railingParts, WallBox, wallPieces } from './wall-pieces';

const wall = { length: 400, thickness: 10, height: 250 };

const door = (offset: number, width = 80): Opening => ({ id: 'd' + offset, wallId: 'w', kind: 'door', offset, width, height: 200, sillHeight: 0 });
const win = (offset: number, width = 100): Opening => ({ id: 'w' + offset, wallId: 'w', kind: 'window', offset, width, height: 120, sillHeight: 90 });

const area = (boxes: WallBox[]) => boxes.reduce((s, b) => s + (b.x1 - b.x0) * (b.y1 - b.y0), 0);

describe('railingParts', () => {
  const parts = railingParts(400);
  const of = (kind: string) => parts.filter((p) => p.kind === kind);

  it('puts posts at both ends and no more than RAILING.postEvery apart', () => {
    const centers = of('post').map((p) => (p.x0 + p.x1) / 2);
    expect(centers[0]).toBeCloseTo(-200);
    expect(centers[centers.length - 1]).toBeCloseTo(200);
    for (let i = 1; i < centers.length; i++) expect(centers[i] - centers[i - 1]).toBeLessThanOrEqual(RAILING.postEvery);
  });

  it('runs the handrail the full length at railing height', () => {
    expect(of('handrail')).toEqual([expect.objectContaining({ x0: -200, x1: 200, y1: RAILING.height })]);
  });

  it('keeps balusters closer than the gap allows', () => {
    const balusters = of('baluster').sort((a, b) => a.x0 - b.x0);
    expect(balusters.length).toBeGreaterThan(20);
    const edges = [...of('post'), ...balusters].sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < edges.length; i++) expect(edges[i].x0 - edges[i - 1].x1).toBeLessThanOrEqual(RAILING.gap + 1e-6);
  });
});

describe('wallPieces', () => {
  it('is a single full-height box extended by half the thickness at each end', () => {
    const { solids, openings } = wallPieces(wall, []);
    expect(openings).toEqual([]);
    expect(solids).toEqual([{ x0: -205, x1: 205, y0: 0, y1: 250 }]);
  });

  it('leaves a door-shaped hole with a header above it', () => {
    const { solids, openings } = wallPieces(wall, [door(100)]);
    // Door spans offsets 60..140, i.e. local x -140..-60.
    expect(openings).toHaveLength(1);
    expect(openings[0]).toMatchObject({ x0: -140, x1: -60, sill: 0, top: 200 });
    expect(solids).toContainEqual({ x0: -205, x1: -140, y0: 0, y1: 250 });
    expect(solids).toContainEqual({ x0: -140, x1: -60, y0: 200, y1: 250 });
    expect(solids).toContainEqual({ x0: -60, x1: 205, y0: 0, y1: 250 });
    expect(solids).toHaveLength(3);
    expect(area(solids)).toBeCloseTo(410 * 250 - 80 * 200);
  });

  it('adds a piece below a window sill', () => {
    const { solids } = wallPieces(wall, [win(200)]);
    expect(solids).toContainEqual({ x0: -50, x1: 50, y0: 0, y1: 90 });
    expect(solids).toContainEqual({ x0: -50, x1: 50, y0: 210, y1: 250 });
    expect(area(solids)).toBeCloseTo(410 * 250 - 100 * 120);
  });

  it('handles adjacent and unsorted openings without gaps or overlaps', () => {
    const { solids, openings } = wallPieces(wall, [win(290), door(150)]);
    expect(openings.map((o) => o.opening.kind)).toEqual(['door', 'window']);
    expect(area(solids)).toBeCloseTo(410 * 250 - 80 * 200 - 100 * 120);
    // No two solids overlap.
    for (let i = 0; i < solids.length; i++)
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i];
        const b = solids[j];
        const overlaps = a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9;
        expect(overlaps).toBe(false);
      }
  });

  it('clips overlapping openings instead of producing negative pieces', () => {
    const { solids } = wallPieces(wall, [door(150, 100), door(180, 100)]);
    for (const s of solids) {
      expect(s.x1).toBeGreaterThan(s.x0);
      expect(s.y1).toBeGreaterThan(s.y0);
    }
    // Combined opening covers offsets 100..230.
    expect(area(solids)).toBeCloseTo(410 * 250 - 130 * 200);
  });

  it('caps openings taller than the wall', () => {
    const tall: Opening = { ...door(200), height: 400 };
    const { solids, openings } = wallPieces(wall, [tall]);
    expect(openings[0].top).toBe(250);
    expect(solids).toHaveLength(2);
  });
});
