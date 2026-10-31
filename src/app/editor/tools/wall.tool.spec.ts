import { TestBed } from '@angular/core/testing';
import { CM_PER_FOOT } from '../../geometry/units';
import { createEmptyPlan } from '../../model/defaults';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { key, pointer, toolContext } from '../../testing/fixtures';
import { WallTool } from './wall.tool';

describe('WallTool', () => {
  let plan: PlanStore;
  let editor: EditorStore;
  let tool: WallTool;

  const click = (x: number, y: number, opts: { shift?: boolean } = {}) => {
    tool.onPointerMove(pointer({ x, y }, opts));
    tool.onPointerDown(pointer({ x, y }, opts));
    tool.onPointerUp();
  };
  const lengths = () =>
    plan
      .segments()
      .map((s) => Math.round(s.length * 100) / 100)
      .sort((a, b) => a - b);

  beforeEach(() => {
    plan = TestBed.inject(PlanStore);
    editor = TestBed.inject(EditorStore);
    plan.load(createEmptyPlan());
    editor.tool.set('wall');
    tool = new WallTool(toolContext(plan, editor));
  });

  it('creates one wall from two clicks', () => {
    click(0, 0);
    expect(plan.plan().walls).toHaveLength(0);
    click(300, 0);
    expect(plan.plan().walls).toHaveLength(1);
    expect(lengths()).toEqual([300]);
  });

  it('chains walls through shared corners', () => {
    click(0, 0);
    click(300, 0);
    click(300, 200);
    expect(plan.plan().walls).toHaveLength(2);
    expect(plan.plan().nodes).toHaveLength(3);
  });

  it('closes a room when clicking the first corner and ends the chain', () => {
    click(0, 0);
    click(300, 0);
    click(300, 200);
    click(0, 200);
    click(0, 0);
    expect(plan.plan().walls).toHaveLength(4);
    expect(plan.rooms()).toHaveLength(1);
    expect(plan.rooms()[0].area).toBeCloseTo(60000);
    expect(editor.overlay().wallChain).toEqual([]);
    // The next click starts a new chain instead of continuing.
    click(500, 500);
    expect(plan.plan().walls).toHaveLength(4);
  });

  it('places the next corner at a typed length along the cursor direction', () => {
    click(0, 0);
    tool.onPointerMove(pointer({ x: 100, y: 0 }));
    for (const k of ['1', '0', "'"]) expect(tool.onKeyDown(key(k))).toBe(true);
    expect(editor.overlay().typedLength).toBe("10'");
    tool.onKeyDown(key('Enter'));
    expect(lengths()).toEqual([Math.round(10 * CM_PER_FOOT * 100) / 100]);
    const far = plan.plan().nodes.find((n) => n.x > 1)!;
    expect(far.x).toBeCloseTo(10 * CM_PER_FOOT);
    expect(far.y).toBeCloseTo(0);
  });

  it('ignores an unparseable typed length', () => {
    click(0, 0);
    tool.onPointerMove(pointer({ x: 100, y: 0 }));
    tool.onKeyDown(key('1'));
    tool.onKeyDown(key('x'));
    tool.onKeyDown(key('Enter'));
    expect(plan.plan().walls).toHaveLength(0);
    expect(editor.overlay().typedLength).toBe('');
  });

  it('removes the last segment with Backspace', () => {
    click(0, 0);
    click(300, 0);
    click(300, 200);
    tool.onKeyDown(key('Backspace'));
    expect(plan.plan().walls).toHaveLength(1);
    // Drawing continues from the previous corner.
    click(300, 300);
    expect(lengths()).toEqual([300, 300]);
  });

  it('ends the chain on the first Esc and switches to select on the second', () => {
    click(0, 0);
    click(300, 0);
    expect(tool.onKeyDown(key('Escape'))).toBe(true);
    expect(editor.tool()).toBe('wall');
    expect(editor.overlay().wallChain).toEqual([]);
    tool.onKeyDown(key('Escape'));
    expect(editor.tool()).toBe('select');
  });

  it('locks to right angles with Shift', () => {
    click(0, 0);
    click(200, 37, { shift: true });
    const end = plan.plan().nodes.find((n) => n.x > 1)!;
    expect(end.y).toBeCloseTo(0);
    expect(end.x).toBeCloseTo(200);
  });

  it('does not swallow tool shortcuts when no length is being typed', () => {
    expect(tool.onKeyDown(key('v'))).toBe(false);
    expect(tool.onKeyDown(key('5'))).toBe(false);
    click(0, 0);
    expect(tool.onKeyDown(key('d'))).toBe(false);
    expect(tool.onKeyDown(key('z', { ctrlKey: true }))).toBe(false);
  });

  it('stops the chain when it reaches an existing corner, closing off a new room', () => {
    click(0, 0);
    click(300, 0);
    click(300, 200);
    click(0, 200);
    click(0, 0);
    // Start a second room from an existing corner and finish on another existing corner.
    click(300, 0);
    click(500, 0);
    click(500, 200);
    click(300, 200);
    expect(plan.rooms()).toHaveLength(2);
    expect(editor.overlay().wallChain).toEqual([]);
    const walls = plan.plan().walls.length;
    click(600, 600);
    expect(plan.plan().walls).toHaveLength(walls);
  });

  it('keeps drawing when a chain starts on an existing corner and heads into open space', () => {
    click(0, 0);
    click(300, 0);
    tool.onKeyDown(key('Escape'));
    click(300, 0);
    click(300, 300);
    expect(editor.overlay().wallChain).toHaveLength(2);
  });

  it('connects to an existing wall with a T-junction', () => {
    click(0, 0);
    click(400, 0);
    tool.onKeyDown(key('Escape'));
    click(200, 200);
    click(203, 4); // snaps onto the wall
    expect(plan.plan().walls).toHaveLength(3);
    expect(editor.overlay().wallChain).toEqual([]);
    expect(lengths()).toEqual([200, 200, 200]);
  });
});
