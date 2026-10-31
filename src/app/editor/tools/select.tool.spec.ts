import { TestBed } from '@angular/core/testing';
import { addWall } from '../../geometry/wall-geometry';
import { createEmptyPlan, createFurniture } from '../../model/defaults';
import { Plan } from '../../model/plan.model';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { key, pointer, squareRoom, toolContext, WALL_PROPS } from '../../testing/fixtures';
import { Hit } from './tool';
import { SelectTool } from './select.tool';

describe('SelectTool', () => {
  let plan: PlanStore;
  let editor: EditorStore;
  let tool: SelectTool;
  let walls: string[];

  const furniture = () => plan.plan().furniture;
  const item = (id = 'f1') => furniture().find((f) => f.id === id)!;

  /** Press at `from`, move through `path`, release at the last point. */
  const drag = (hit: Hit | null, from: { x: number; y: number }, ...path: { x: number; y: number }[]) => {
    tool.onPointerDown(pointer(from, { hit }));
    for (const p of path) tool.onPointerMove(pointer(p));
    tool.onPointerUp(pointer(path.at(-1) ?? from));
  };
  const click = (hit: Hit | null, at: { x: number; y: number }, shift = false) => {
    tool.onPointerDown(pointer(at, { hit, shift }));
    tool.onPointerUp(pointer(at, { shift }));
  };

  beforeEach(() => {
    plan = TestBed.inject(PlanStore);
    editor = TestBed.inject(EditorStore);
    const p: Plan = createEmptyPlan();
    walls = squareRoom(p, 400, 400);
    p.furniture.push({ ...createFurniture('box', { x: 200, y: 200 }), id: 'f1' });
    p.furniture.push({ ...createFurniture('box', { x: 300, y: 300 }), id: 'f2' });
    p.openings.push({ id: 'o1', wallId: walls[0], kind: 'window', offset: 200, width: 80, height: 100, sillHeight: 90 });
    plan.load(p);
    editor.clearSelection();
    tool = new SelectTool(toolContext(plan, editor));
  });

  describe('selection', () => {
    it('selects furniture on click and toggles with Shift', () => {
      click({ kind: 'furniture', id: 'f1' }, { x: 200, y: 200 });
      expect(editor.selection()).toEqual([{ kind: 'furniture', id: 'f1' }]);
      click({ kind: 'furniture', id: 'f2' }, { x: 300, y: 300 }, true);
      expect(editor.selection()).toHaveLength(2);
      click({ kind: 'furniture', id: 'f1' }, { x: 200, y: 200 }, true);
      expect(editor.selection()).toEqual([{ kind: 'furniture', id: 'f2' }]);
    });

    it('clears the selection when clicking empty space', () => {
      editor.select([{ kind: 'furniture', id: 'f1' }]);
      click(null, { x: 900, y: 900 });
      expect(editor.selection()).toEqual([]);
    });

    it('selects a room when clicking its floor', () => {
      const room = plan.rooms()[0];
      click({ kind: 'room', id: room.key }, { x: 50, y: 50 });
      expect(editor.selection()).toEqual([{ kind: 'room', id: room.key }]);
    });

    it('box-selects furniture and walls fully inside the box', () => {
      drag(null, { x: 150, y: 150 }, { x: 250, y: 250 });
      expect(editor.selection()).toEqual([{ kind: 'furniture', id: 'f1' }]);
      drag(null, { x: -50, y: -50 }, { x: 450, y: 450 });
      const kinds = editor.selection().map((s) => s.kind);
      expect(kinds.filter((k) => k === 'furniture')).toHaveLength(2);
      expect(kinds.filter((k) => k === 'wall')).toHaveLength(4);
    });
  });

  describe('moving furniture', () => {
    it('moves with the pointer as a single undo step', () => {
      drag({ kind: 'furniture', id: 'f1' }, { x: 200, y: 200 }, { x: 210, y: 200 }, { x: 230, y: 220 }, { x: 250, y: 210 });
      expect(item().x).toBeCloseTo(250);
      expect(item().y).toBeCloseTo(210);
      plan.undo();
      expect(item().x).toBe(200);
      expect(item().y).toBe(200);
      expect(plan.canUndo()).toBe(false);
    });

    it('ignores tiny pointer jitter', () => {
      drag({ kind: 'furniture', id: 'f1' }, { x: 200, y: 200 }, { x: 201, y: 201 });
      expect(item().x).toBe(200);
      expect(plan.canUndo()).toBe(false);
    });

    it('snaps flush against a wall it comes close to', () => {
      // Top wall face is at y = 5; the box is about 61 cm deep.
      drag({ kind: 'furniture', id: 'f1' }, { x: 200, y: 200 }, { x: 200, y: 45 });
      expect(item().y).toBeCloseTo(5 + item().depth / 2, 0);
    });

    it('does not snap when Alt is held', () => {
      tool.onPointerDown(pointer({ x: 200, y: 200 }, { hit: { kind: 'furniture', id: 'f1' } }));
      tool.onPointerMove(pointer({ x: 200, y: 45 }, { alt: true }));
      tool.onPointerUp(pointer({ x: 200, y: 45 }));
      expect(item().y).toBeCloseTo(45);
    });

    it('moves every selected item together', () => {
      editor.select([
        { kind: 'furniture', id: 'f1' },
        { kind: 'furniture', id: 'f2' },
      ]);
      drag({ kind: 'furniture', id: 'f1' }, { x: 200, y: 200 }, { x: 180, y: 190 });
      expect(item('f1')).toMatchObject({ x: 180, y: 190 });
      expect(item('f2')).toMatchObject({ x: 280, y: 290 });
    });

    it('reports distances to walls while dragging one item', () => {
      tool.onPointerDown(pointer({ x: 200, y: 200 }, { hit: { kind: 'furniture', id: 'f1' } }));
      tool.onPointerMove(pointer({ x: 210, y: 200 }));
      expect(editor.overlay().measures).toHaveLength(4);
      tool.onPointerUp(pointer({ x: 210, y: 200 }));
      expect(editor.overlay().measures).toEqual([]);
    });

    it('reverts the drag on Escape', () => {
      tool.onPointerDown(pointer({ x: 200, y: 200 }, { hit: { kind: 'furniture', id: 'f1' } }));
      tool.onPointerMove(pointer({ x: 260, y: 260 }));
      expect(tool.onKeyDown(key('Escape'))).toBe(true);
      expect(item()).toMatchObject({ x: 200, y: 200 });
    });
  });

  describe('furniture handles', () => {
    beforeEach(() => editor.select([{ kind: 'furniture', id: 'f1' }]));

    it('rotates in 15 degree steps', () => {
      drag({ kind: 'handle', id: 'f1', handle: 'rotate' }, { x: 200, y: 160 }, { x: 300, y: 207 });
      expect(item().rotation).toBe(90);
    });

    it('rotates freely with Alt', () => {
      tool.onPointerDown(pointer({ x: 200, y: 160 }, { hit: { kind: 'handle', id: 'f1', handle: 'rotate' } }));
      tool.onPointerMove(pointer({ x: 300, y: 207 }, { alt: true }));
      tool.onPointerUp(pointer({ x: 300, y: 207 }));
      expect(item().rotation).toBeCloseTo(90 + (Math.atan2(7, 100) * 180) / Math.PI);
    });

    it('resizes from the east edge keeping the west edge fixed', () => {
      const west = item().x - item().width / 2;
      drag({ kind: 'handle', id: 'f1', handle: 'e' }, { x: 230, y: 200 }, { x: 300, y: 200 });
      expect(item().width).toBeGreaterThan(125);
      expect(item().x - item().width / 2).toBeCloseTo(west);
      expect(item().depth).toBeCloseTo(24 * 2.54);
    });

    it('resizes rotated items along their own axes', () => {
      plan.update((d) => {
        d.furniture[0].rotation = 90;
      });
      // With 90° rotation the item's south edge points toward -x on screen.
      drag({ kind: 'handle', id: 'f1', handle: 's' }, { x: 170, y: 200 }, { x: 100, y: 200 });
      expect(item().depth).toBeGreaterThan(125);
      expect(item().width).toBeCloseTo(24 * 2.54);
      expect(item().y).toBeCloseTo(200);
    });

    it('never shrinks below a minimum size', () => {
      drag({ kind: 'handle', id: 'f1', handle: 'e' }, { x: 230, y: 200 }, { x: 0, y: 200 });
      expect(item().width).toBeGreaterThanOrEqual(5);
    });
  });

  describe('walls, corners and openings', () => {
    const node = (x: number, y: number) => plan.plan().nodes.find((n) => Math.abs(n.x - x) < 0.01 && Math.abs(n.y - y) < 0.01);

    it('drags a corner and reshapes the connected walls', () => {
      const corner = node(400, 400)!;
      drag({ kind: 'node', id: corner.id }, { x: 400, y: 400 }, { x: 450, y: 480 });
      expect(node(450, 480)).toBeDefined();
      expect(plan.rooms()[0].area).toBeGreaterThan(160000);
    });

    it('merges a corner dropped onto another corner', () => {
      plan.update((d) => {
        addWall(d, { x: 600, y: 0 }, { x: 600, y: 200 }, WALL_PROPS);
      });
      const loose = node(600, 0)!;
      const before = plan.plan().nodes.length;
      drag({ kind: 'node', id: loose.id }, { x: 600, y: 0 }, { x: 500, y: 0 }, { x: 403, y: 2 });
      expect(plan.plan().nodes).toHaveLength(before - 1);
      const merged = node(400, 0)!;
      expect(plan.plan().walls.filter((w) => w.a === merged.id || w.b === merged.id)).toHaveLength(3);
      // Merge and move are a single undo step.
      plan.undo();
      expect(plan.plan().nodes).toHaveLength(before);
    });

    it('moves a wall along its normal, snapped to the grid', () => {
      drag({ kind: 'wall', id: walls[0] }, { x: 200, y: 0 }, { x: 260, y: -47 });
      expect(node(0, -50)).toBeDefined();
      expect(node(400, -50)).toBeDefined();
    });

    it('slides an opening along its wall and keeps it on the wall', () => {
      drag({ kind: 'opening', id: 'o1' }, { x: 200, y: 0 }, { x: 300, y: 40 });
      expect(plan.plan().openings[0].offset).toBe(300);
      drag({ kind: 'opening', id: 'o1' }, { x: 300, y: 0 }, { x: -500, y: 0 });
      expect(plan.plan().openings[0].offset).toBe(40);
    });

    it('keeps openings on a wall that gets shorter', () => {
      plan.update((d) => {
        d.openings[0].offset = 350;
      });
      const corner = node(400, 0)!;
      drag({ kind: 'node', id: corner.id }, { x: 400, y: 0 }, { x: 300, y: 0 });
      const o = plan.plan().openings[0];
      const seg = plan.segmentById().get(o.wallId)!;
      expect(o.offset + o.width / 2).toBeLessThanOrEqual(seg.length + 1e-6);
    });
  });
});
