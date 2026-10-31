import { TestBed } from '@angular/core/testing';
import { CM_PER_FOOT } from '../geometry/units';
import { catalogItem } from '../model/catalog';
import { createEmptyPlan, createFurniture } from '../model/defaults';
import { squareRoom } from '../testing/fixtures';
import { EditorActions } from './editor-actions';
import { EditorStore } from './editor.store';
import { PlanStore } from './plan.store';

describe('EditorActions', () => {
  let plan: PlanStore;
  let editor: EditorStore;
  let actions: EditorActions;
  let walls: string[];

  const lastFurniture = () => plan.plan().furniture.at(-1)!;

  beforeEach(() => {
    plan = TestBed.inject(PlanStore);
    editor = TestBed.inject(EditorStore);
    actions = TestBed.inject(EditorActions);
    const p = createEmptyPlan();
    walls = squareRoom(p, 400, 400);
    p.openings.push({ id: 'o1', wallId: walls[0], kind: 'door', offset: 100, width: 80, height: 200, sillHeight: 0 });
    p.furniture.push({ ...createFurniture('box', { x: 200, y: 200 }), id: 'f1', rotation: 170 });
    plan.load(p);
    editor.clearSelection();
    editor.viewport.set({ x: 0, y: 0, zoom: 1 });
    editor.canvasSize.set({ width: 800, height: 600 });
  });

  describe('placeFurniture', () => {
    it('drops at the view center by default and selects the new item', () => {
      editor.tool.set('wall');
      actions.placeFurniture('ottoman');
      expect(lastFurniture()).toMatchObject({ catalogId: 'ottoman', x: 400, y: 300 });
      expect(editor.selection()).toEqual([{ kind: 'furniture', id: lastFurniture().id }]);
      expect(editor.tool()).toBe('select');
    });

    it('snaps back-to-wall when dropped near a wall', () => {
      actions.placeFurniture('sofa-3', { x: 200, y: 30 });
      const sofa = lastFurniture();
      expect(sofa.y).toBeCloseTo(5 + catalogItem('sofa-3').depth / 2);
      expect(sofa.rotation).toBeCloseTo(0);
    });

    it('turns to face into the room from a side wall', () => {
      actions.placeFurniture('sofa-3', { x: 370, y: 200 });
      const sofa = lastFurniture();
      expect(sofa.x).toBeCloseTo(395 - catalogItem('sofa-3').depth / 2);
      expect(Math.abs(sofa.rotation)).toBeCloseTo(90);
    });

    it('leaves items in the open where they were dropped', () => {
      actions.placeFurniture('sofa-3', { x: 200, y: 200 });
      expect(lastFurniture()).toMatchObject({ x: 200, y: 200, rotation: 0 });
    });

    it('never snaps items flagged noWallSnap', () => {
      actions.placeFurniture('dining-chair', { x: 200, y: 30 });
      expect(lastFurniture()).toMatchObject({ x: 200, y: 30 });
    });

    it('sets small items on top of the furniture they are dropped on', () => {
      actions.placeFurniture('table-lamp', { x: 200, y: 200 });
      expect(lastFurniture().elevation).toBeCloseTo(catalogItem('box').height, 5);
      actions.placeFurniture('table-lamp', { x: 300, y: 300 });
      expect(lastFurniture().elevation).toBeUndefined();
    });

    it('hangs wall items at their default height', () => {
      actions.placeFurniture('art-small', { x: 200, y: 20 });
      const art = lastFurniture();
      expect(art.y).toBeCloseTo(5 + art.depth / 2, 5);
      expect(art.elevation! + art.height / 2).toBeCloseTo(catalogItem('art-small').defaultElevation!, 5);
    });

    it('is a single undo step', () => {
      actions.placeFurniture('sofa-3', { x: 200, y: 200 });
      plan.undo();
      expect(plan.plan().furniture).toHaveLength(1);
    });
  });

  it('toggles the elevation of the selected wall, facing its room', () => {
    actions.toggleElevation();
    expect(editor.elevation()).toBeNull();
    editor.select([{ kind: 'wall', id: walls[0] }]);
    actions.toggleElevation();
    // The top wall runs left to right, so its front faces down into the room.
    expect(editor.elevation()).toEqual({ wallId: walls[0], side: 'front' });
    actions.toggleElevation();
    expect(editor.elevation()).toBeNull();
  });

  describe('deleteSelection', () => {
    it('removes furniture, openings and walls together, including openings on deleted walls', () => {
      editor.select([
        { kind: 'furniture', id: 'f1' },
        { kind: 'wall', id: walls[0] },
      ]);
      actions.deleteSelection();
      const p = plan.plan();
      expect(p.furniture).toEqual([]);
      expect(p.walls).toHaveLength(3);
      expect(p.openings).toEqual([]);
      expect(editor.selection()).toEqual([]);
      expect(plan.rooms()).toEqual([]);
    });

    it('removes a corner with its walls', () => {
      const corner = plan.plan().nodes.find((n) => n.x === 0 && n.y === 0)!;
      editor.select([{ kind: 'node', id: corner.id }]);
      actions.deleteSelection();
      expect(plan.plan().walls).toHaveLength(2);
      expect(plan.plan().nodes).toHaveLength(3);
    });

    it('does nothing for room-only or empty selections', () => {
      actions.deleteSelection();
      editor.select([{ kind: 'room', id: plan.rooms()[0].key }]);
      actions.deleteSelection();
      expect(plan.canUndo()).toBe(false);
    });
  });

  it('duplicates furniture with an offset and selects the copies', () => {
    editor.select([{ kind: 'furniture', id: 'f1' }]);
    actions.duplicateSelection();
    const copy = lastFurniture();
    expect(copy.id).not.toBe('f1');
    expect(copy.x).toBeCloseTo(200 + CM_PER_FOOT);
    expect(copy.y).toBeCloseTo(200 + CM_PER_FOOT);
    expect(editor.selection()).toEqual([{ kind: 'furniture', id: copy.id }]);
  });

  it('wraps rotation into the range -180..180', () => {
    editor.select([{ kind: 'furniture', id: 'f1' }]);
    actions.rotateSelection(90);
    expect(plan.plan().furniture[0].rotation).toBe(-100);
    actions.rotateSelection(-90);
    expect(plan.plan().furniture[0].rotation).toBe(170);
    actions.rotateSelection(10);
    expect(plan.plan().furniture[0].rotation).toBe(180);
  });

  it('merges consecutive nudges into one undo step', () => {
    editor.select([{ kind: 'furniture', id: 'f1' }]);
    actions.nudgeSelection(5, 0);
    actions.nudgeSelection(5, 0);
    actions.nudgeSelection(0, -3);
    expect(plan.plan().furniture[0]).toMatchObject({ x: 210, y: 197 });
    plan.undo();
    expect(plan.plan().furniture[0]).toMatchObject({ x: 200, y: 200 });
  });

  it('ignores furniture commands when no furniture is selected', () => {
    editor.select([{ kind: 'wall', id: walls[0] }]);
    actions.duplicateSelection();
    actions.rotateSelection(90);
    actions.nudgeSelection(10, 10);
    expect(plan.canUndo()).toBe(false);
  });

  it('selects all furniture and walls', () => {
    actions.selectAll();
    expect(editor.selection()).toHaveLength(5);
  });
});
