import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createFurniture, createStarterPlan } from '../../model/defaults';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { installResizeObserver } from '../../testing/fixtures';
import { FURNITURE_DRAG_MIME, PlanCanvas } from './plan-canvas';

describe('PlanCanvas', () => {
  let fixture: ComponentFixture<PlanCanvas>;
  let plan: PlanStore;
  let editor: EditorStore;
  let resize: (w: number, h: number) => void;
  let el: HTMLElement;

  const all = (sel: string) => Array.from(el.querySelectorAll(sel));
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    resize = installResizeObserver();
    plan = TestBed.inject(PlanStore);
    editor = TestBed.inject(EditorStore);
    plan.load(createStarterPlan());
    editor.tool.set('select');
    editor.clearSelection();
    editor.clearOverlay();
    editor.viewport.set({ x: 0, y: 0, zoom: 1 });
    fixture = TestBed.createComponent(PlanCanvas);
    el = fixture.nativeElement;
    await render();
  });

  it('draws the starter room: walls, floor, label, door and window', () => {
    expect(all('.walls-fill line')).toHaveLength(4);
    expect(all('.walls-hit line')).toHaveLength(4);
    expect(all('polygon.room')).toHaveLength(1);
    expect(el.querySelector('.room-label')?.textContent).toContain('Living room');
    expect(el.querySelector('.room-label')?.textContent).toContain('168 sq ft');
    expect(all('.door-arc')).toHaveLength(1);
    expect(all('.window-frame')).toHaveLength(1);
    expect(all('.dimension').map((d) => d.textContent?.trim())).toEqual(expect.arrayContaining([`12' 0"`, `14' 0"`]));
  });

  it('shows corner handles only with the select tool', async () => {
    expect(all('circle.node')).toHaveLength(4);
    editor.tool.set('wall');
    await render();
    expect(all('circle.node')).toHaveLength(0);
  });

  it('switches labels to metric', async () => {
    plan.update((d) => {
      d.displayUnits = 'metric';
    });
    await render();
    expect(el.querySelector('.room-area')?.textContent).toContain('15.6 m²');
  });

  it('outlines furniture that overlaps other furniture', async () => {
    plan.update((d) => {
      d.furniture.push(createFurniture('box', { x: 150, y: 200 }), createFurniture('box', { x: 170, y: 210 }));
    });
    await render();
    expect(all('g.furniture')).toHaveLength(2);
    expect(all('.overlap-outline')).toHaveLength(2);
  });

  it('draws rugs under other furniture without overlap warnings', async () => {
    plan.update((d) => {
      d.furniture.push(createFurniture('coffee-table', { x: 180, y: 200 }), createFurniture('rug-small', { x: 180, y: 200 }));
    });
    await render();
    const ids = all('g.furniture').map((g) => g.getAttribute('data-id'));
    expect(ids[0]).toBe(plan.plan().furniture[1].id);
    expect(all('.overlap-outline')).toHaveLength(0);
  });

  it('shows resize and rotate handles for one selected item', async () => {
    plan.update((d) => {
      d.furniture.push({ ...createFurniture('sofa-3', { x: 180, y: 200 }), id: 'sofa' });
    });
    editor.select([{ kind: 'furniture', id: 'sofa' }]);
    await render();
    expect(all('[data-kind="handle"]').map((h) => h.getAttribute('data-handle')).sort()).toEqual(['e', 'n', 'rotate', 's', 'w']);
    expect(el.querySelector('.size-label')?.textContent).toContain(`7' 0" × 3' 0"`);
  });

  it('places furniture dropped from the catalog', async () => {
    const drop = new MouseEvent('drop', { clientX: 150, clientY: 250, bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: (t: string) => (t === FURNITURE_DRAG_MIME ? 'armchair' : ''), types: [FURNITURE_DRAG_MIME] },
    });
    el.querySelector('svg')!.dispatchEvent(drop);
    await render();
    const added = plan.plan().furniture.at(-1)!;
    expect(added.catalogId).toBe('armchair');
    expect(added).toMatchObject({ x: 150, y: 250 });
    expect(editor.selection()).toEqual([{ kind: 'furniture', id: added.id }]);
  });

  it('ignores drops that are not catalog items', async () => {
    const drop = new MouseEvent('drop', { clientX: 150, clientY: 250, bubbles: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: () => 'evil', types: ['text/plain'] } });
    el.querySelector('svg')!.dispatchEvent(drop);
    expect(plan.plan().furniture).toEqual([]);
  });

  it('zooms around the cursor on wheel', () => {
    el.querySelector('svg')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: 100, clientY: 80, cancelable: true }));
    const v = editor.viewport();
    expect(v.zoom).toBeGreaterThan(1);
    // The world point under the cursor stays put.
    expect((100 - v.x) / v.zoom).toBeCloseTo(100);
    expect((80 - v.y) / v.zoom).toBeCloseTo(80);
  });

  it('fits the plan to the canvas once it has a size', () => {
    resize(800, 600);
    const v = editor.viewport();
    // Starter room is 12 x 14 ft; its center should land at the canvas center.
    expect(v.x + 182.88 * v.zoom).toBeCloseTo(400, 0);
    expect(v.y + 213.36 * v.zoom).toBeCloseTo(300, 0);
    expect(426.72 * v.zoom).toBeLessThanOrEqual(600);
  });

  it('shows the empty-plan hint only for an empty plan', async () => {
    expect(el.querySelector('.empty-hint')).toBeNull();
    plan.update((d) => {
      d.walls = [];
      d.nodes = [];
      d.openings = [];
    });
    await render();
    expect(el.querySelector('.empty-hint')).not.toBeNull();
  });
});
