import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CM_PER_FOOT } from '../../geometry/units';
import { createEmptyPlan, createFurniture } from '../../model/defaults';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { squareRoom } from '../../testing/fixtures';
import { PropertiesPanel } from './properties-panel';

describe('PropertiesPanel', () => {
  let fixture: ComponentFixture<PropertiesPanel>;
  let plan: PlanStore;
  let editor: EditorStore;
  let walls: string[];
  let el: HTMLElement;

  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const heading = () => el.querySelector('h2')?.textContent?.trim();
  const enterLength = async (index: number, text: string) => {
    const input = el.querySelectorAll<HTMLInputElement>('app-length-input input')[index];
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = text;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await render();
  };

  beforeEach(async () => {
    plan = TestBed.inject(PlanStore);
    editor = TestBed.inject(EditorStore);
    const p = createEmptyPlan('Test plan');
    walls = squareRoom(p, 400, 300);
    p.furniture.push({ ...createFurniture('sofa-3', { x: 200, y: 150 }), id: 'f1' });
    p.openings.push({ id: 'o1', wallId: walls[0], kind: 'door', offset: 200, width: 80, height: 200, sillHeight: 0, swing: 'left' });
    plan.load(p);
    editor.clearSelection();
    fixture = TestBed.createComponent(PropertiesPanel);
    el = fixture.nativeElement;
    await render();
  });

  it('shows plan settings and a summary with nothing selected', () => {
    expect(heading()).toBe('Plan');
    expect(el.textContent).toContain('Rooms');
    expect(el.querySelector<HTMLInputElement>('input.input')?.value).toBe('Test plan');
  });

  it.each([
    ['wall', 'Wall'],
    ['opening', 'Door'],
    ['furniture', 'Sofa'],
  ] as const)('shows the %s section', async (kind, title) => {
    const id = kind === 'wall' ? walls[0] : kind === 'opening' ? 'o1' : 'f1';
    editor.select([{ kind, id }]);
    await render();
    expect(heading()).toBe(title);
  });

  it('shows room and multi-selection sections', async () => {
    editor.select([{ kind: 'room', id: plan.rooms()[0].key }]);
    await render();
    expect(heading()).toBe('Room');
    editor.select([
      { kind: 'furniture', id: 'f1' },
      { kind: 'wall', id: walls[0] },
    ]);
    await render();
    expect(heading()).toBe('2 selected');
  });

  it('falls back to plan settings when the selected item no longer exists', async () => {
    editor.select([{ kind: 'furniture', id: 'gone' }]);
    await render();
    expect(heading()).toBe('Plan');
  });

  it('sets an exact wall length', async () => {
    editor.select([{ kind: 'wall', id: walls[0] }]);
    await render();
    await enterLength(0, "10'");
    expect(plan.segmentById().get(walls[0])!.length).toBeCloseTo(10 * CM_PER_FOOT);
  });

  it('resizes furniture', async () => {
    editor.select([{ kind: 'furniture', id: 'f1' }]);
    await render();
    await enterLength(1, '40"');
    expect(plan.plan().furniture[0].depth).toBeCloseTo(40 * 2.54);
  });

  it('changes furniture color from a swatch', async () => {
    editor.select([{ kind: 'furniture', id: 'f1' }]);
    await render();
    el.querySelector<HTMLButtonElement>('.swatch[title="#a83f3f"]')!.click();
    expect(plan.plan().furniture[0].color).toBe('#a83f3f');
  });

  it('creates room metadata when a room is first customized', async () => {
    expect(plan.plan().rooms).toEqual([]);
    editor.select([{ kind: 'room', id: plan.rooms()[0].key }]);
    await render();
    el.querySelector<HTMLButtonElement>('.swatch[title="Walnut"]')!.click();
    await render();
    expect(plan.plan().rooms).toHaveLength(1);
    expect(plan.rooms()[0].floorColor).toBe('#7d5a3c');
    // A second change updates the same metadata instead of adding another.
    el.querySelector<HTMLButtonElement>('.swatch[title="Sage"]')!.click();
    expect(plan.plan().rooms).toHaveLength(1);
    expect(plan.rooms()[0].wallColor).toBe('#b9c4ad');
  });

  it('flips door hinge side and swing', async () => {
    editor.select([{ kind: 'opening', id: 'o1' }]);
    await render();
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('button'));
    buttons.find((b) => b.textContent?.trim() === 'Right')!.click();
    buttons.find((b) => b.textContent?.includes('Flip to other side'))!.click();
    expect(plan.plan().openings[0]).toMatchObject({ swing: 'right', flip: true });
  });

  it('switches units', async () => {
    Array.from(el.querySelectorAll<HTMLButtonElement>('.segmented button'))
      .find((b) => b.textContent?.trim() === 'Metric')!
      .click();
    expect(plan.units()).toBe('metric');
  });
});
