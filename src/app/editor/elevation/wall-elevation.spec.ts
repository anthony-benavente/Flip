import { ComponentFixture, TestBed } from '@angular/core/testing';
import { mountedWall } from '../../geometry/elevation';
import { Viewport, worldToScreen } from '../../geometry/viewport';
import { removeWalls } from '../../geometry/wall-geometry';
import { createEmptyPlan, createFurniture } from '../../model/defaults';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { installResizeObserver, squareRoom } from '../../testing/fixtures';
import { FURNITURE_DRAG_MIME } from '../drag-drop';
import { WallElevation } from './wall-elevation';

describe('WallElevation', () => {
  let fixture: ComponentFixture<WallElevation>;
  let plan: PlanStore;
  let editor: EditorStore;
  let el: HTMLElement;
  let walls: string[];

  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const art = () => plan.plan().furniture.find((f) => f.id === 'art')!;
  const svg = () => el.querySelector('svg')!;
  /** Screen position of a face point: `x` along the face, `height` above the floor. */
  const screenAt = (x: number, height: number) => {
    const v = (fixture.componentInstance as unknown as { viewport: () => Viewport }).viewport();
    return worldToScreen(v, { x, y: -height });
  };
  const pointer = (type: string, target: Element, at: { x: number; y: number }, init: MouseEventInit = {}) => {
    const e = new MouseEvent(type, { clientX: at.x, clientY: at.y, bubbles: true, cancelable: true, button: 0, ...init });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    target.dispatchEvent(e);
  };

  beforeEach(async () => {
    const resize = installResizeObserver();
    plan = TestBed.inject(PlanStore);
    editor = TestBed.inject(EditorStore);
    const p = createEmptyPlan('Test', 'metric');
    walls = squareRoom(p, 400, 300);
    p.rooms.push({ id: 'r', anchor: { x: 200, y: 150 }, name: 'Den', floorColor: '#111111', wallColor: '#223344' });
    const hung = { ...createFurniture('art-small', { x: 100, y: 0 }), id: 'art', elevation: 120 };
    hung.y = 5 + hung.depth / 2;
    p.furniture.push(hung);
    plan.load(p);
    editor.clearSelection();
    editor.openElevation(walls[0], 'front');
    fixture = TestBed.createComponent(WallElevation);
    el = fixture.nativeElement;
    await render();
    resize(800, 600);
    await render();
  });

  afterEach(() => editor.closeElevation());

  it('draws the face with its hung art and height guides', () => {
    expect(el.querySelector('h2')?.textContent).toContain('Den wall');
    expect(el.querySelectorAll('.item[data-kind="furniture"]')).toHaveLength(1);
    expect(el.querySelector('.guide-eye text')?.textContent).toContain('Eye level');
  });

  it('drags hung art up the wall as one undo step', async () => {
    const hit = el.querySelector('.item .hit')!;
    const center = 120 + art().height / 2;
    pointer('pointerdown', hit, screenAt(100, center));
    pointer('pointermove', svg(), screenAt(100, center + 10), { altKey: true });
    pointer('pointermove', svg(), screenAt(130, center + 30), { altKey: true });
    pointer('pointerup', svg(), screenAt(130, center + 30));
    await render();

    expect(editor.selection()).toEqual([{ kind: 'furniture', id: 'art' }]);
    expect(art().elevation).toBeCloseTo(150, 0);
    expect(mountedWall(art(), plan.segments())!.along).toBeCloseTo(130, 0);
    expect(el.querySelector('.height-label')?.textContent).toContain('center');
    plan.undo();
    expect(art().elevation).toBe(120);
  });

  it('snaps the art center to eye level', async () => {
    const hit = el.querySelector('.item .hit')!;
    const center = 120 + art().height / 2;
    pointer('pointerdown', hit, screenAt(100, center));
    pointer('pointermove', svg(), screenAt(100, 143));
    pointer('pointerup', svg(), screenAt(100, 143));
    await render();
    expect(art().elevation! + art().height / 2).toBeCloseTo(57 * 2.54, 1);
  });

  it('nudges the selected item with arrow keys', async () => {
    editor.select([{ kind: 'furniture', id: 'art' }]);
    await render();
    expect(fixture.componentInstance.handleKey(new KeyboardEvent('keydown', { key: 'ArrowUp' }))).toBe(true);
    expect(art().elevation).toBeGreaterThan(120);
    expect(fixture.componentInstance.handleKey(new KeyboardEvent('keydown', { key: 'x' }))).toBe(false);
  });

  it('hangs wall items dropped from the catalog where they land', async () => {
    const at = screenAt(300, 160);
    const drop = new MouseEvent('drop', { clientX: at.x, clientY: at.y, bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: (t: string) => (t === FURNITURE_DRAG_MIME ? 'mirror' : ''), types: [FURNITURE_DRAG_MIME] },
    });
    svg().dispatchEvent(drop);
    await render();
    const mirror = plan.plan().furniture.at(-1)!;
    expect(mirror.catalogId).toBe('mirror');
    expect(mirror.elevation! + mirror.height / 2).toBeCloseTo(160, 0);
    const mount = mountedWall(mirror, plan.segments())!;
    expect(mount.side).toBe('front');
    expect(mount.along).toBeCloseTo(300, 0);
  });

  it('flips to the other side and closes when the wall is deleted', async () => {
    el.querySelector<HTMLButtonElement>('button[title^="Show the other side"]')!.click();
    expect(editor.elevation()).toEqual({ wallId: walls[0], side: 'back' });
    await render();
    expect(el.querySelectorAll('.item[data-kind="furniture"]')).toHaveLength(0);

    plan.update((d) => removeWalls(d, [walls[0]]));
    await render();
    expect(editor.elevation()).toBeNull();
  });
});
