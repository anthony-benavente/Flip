import { TestBed } from '@angular/core/testing';
import { createEmptyPlan, DEFAULT_DOOR, DEFAULT_WINDOW } from '../../model/defaults';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { key, pointer, squareRoom, toolContext } from '../../testing/fixtures';
import { OpeningTool } from './opening.tool';

describe('OpeningTool', () => {
  let plan: PlanStore;
  let editor: EditorStore;
  let walls: string[];

  const setup = (wallHeight = 240) => {
    const p = createEmptyPlan();
    walls = squareRoom(p, 400, 400, { x: 0, y: 0 }, { thickness: 10, height: wallHeight });
    plan.load(p);
  };

  beforeEach(() => {
    plan = TestBed.inject(PlanStore);
    editor = TestBed.inject(EditorStore);
    editor.clearSelection();
    editor.clearOverlay();
    setup();
  });

  it('previews on the wall under the cursor, snapped to the grid', () => {
    const tool = new OpeningTool(toolContext(plan, editor), 'door');
    tool.onPointerMove(pointer({ x: 203, y: 6 }));
    expect(editor.overlay().openingPreview).toEqual({ wallId: walls[0], offset: 200, width: DEFAULT_DOOR.width, kind: 'door' });
    tool.onPointerMove(pointer({ x: 200, y: 200 }));
    expect(editor.overlay().openingPreview).toBeNull();
  });

  it('places a door, selects it and returns to the select tool', () => {
    editor.tool.set('door');
    const tool = new OpeningTool(toolContext(plan, editor), 'door');
    tool.onPointerDown(pointer({ x: 200, y: 3 }));
    const [o] = plan.plan().openings;
    expect(o).toMatchObject({ kind: 'door', wallId: walls[0], offset: 200, width: DEFAULT_DOOR.width, sillHeight: 0, swing: 'left' });
    expect(editor.selection()).toEqual([{ kind: 'opening', id: o.id }]);
    expect(editor.tool()).toBe('select');
  });

  it('keeps the opening inside the wall near a corner', () => {
    const tool = new OpeningTool(toolContext(plan, editor), 'window');
    tool.onPointerDown(pointer({ x: 2, y: 2 }));
    const [o] = plan.plan().openings;
    expect(o.offset - o.width / 2).toBeGreaterThanOrEqual(0);
  });

  it('fits a window under a low wall', () => {
    setup(150);
    const tool = new OpeningTool(toolContext(plan, editor), 'window');
    tool.onPointerDown(pointer({ x: 200, y: 3 }));
    const [o] = plan.plan().openings;
    expect(o.sillHeight).toBe(DEFAULT_WINDOW.sillHeight);
    expect(o.sillHeight + o.height).toBeCloseTo(150);
  });

  it('narrows the opening on a wall shorter than the default width', () => {
    const p = createEmptyPlan();
    squareRoom(p, 60, 400);
    plan.load(p);
    const tool = new OpeningTool(toolContext(plan, editor), 'door');
    tool.onPointerDown(pointer({ x: 30, y: 0 }));
    expect(plan.plan().openings[0].width).toBeCloseTo(60);
  });

  it('does nothing when clicking away from walls or with another button', () => {
    const tool = new OpeningTool(toolContext(plan, editor), 'door');
    tool.onPointerDown(pointer({ x: 200, y: 200 }));
    tool.onPointerDown(pointer({ x: 200, y: 3 }, { button: 2 }));
    expect(plan.plan().openings).toEqual([]);
  });

  it('cancels back to the select tool on Escape', () => {
    editor.tool.set('window');
    const tool = new OpeningTool(toolContext(plan, editor), 'window');
    expect(tool.onKeyDown(key('Escape'))).toBe(true);
    expect(editor.tool()).toBe('select');
  });
});
