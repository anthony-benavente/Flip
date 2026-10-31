import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createFurniture, createStarterPlan } from '../../model/defaults';
import { Plan } from '../../model/plan.model';
import { LocalPlanRepository } from '../../persistence/local-plan.repository';
import { PLAN_REPOSITORY } from '../../persistence/plan-repository';
import { Preview3d } from '../../preview3d/preview3d';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { installResizeObserver, MemoryStorage } from '../../testing/fixtures';
import { EditorPage } from './editor-page';

/** Stands in for the WebGL preview, which jsdom cannot run. */
@Component({ selector: 'app-preview3d', template: '<div class="fake-preview"></div>' })
class FakePreview {}

describe('EditorPage', () => {
  let fixture: ComponentFixture<EditorPage>;
  let repo: LocalPlanRepository;
  let plan: PlanStore;
  let editor: EditorStore;
  let saved: Plan;
  let el: HTMLElement;

  const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    fixture.detectChanges();
  };

  const open = async (id: string) => {
    fixture = TestBed.createComponent(EditorPage);
    el = fixture.nativeElement;
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    installResizeObserver();
    repo = new LocalPlanRepository(new MemoryStorage());
    saved = createStarterPlan('Kitchen');
    saved.furniture.push({ ...createFurniture('box', { x: 150, y: 200 }), id: 'f1' });
    await repo.save(saved);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PLAN_REPOSITORY, useValue: repo }],
    });
    TestBed.overrideComponent(EditorPage, { remove: { imports: [Preview3d] }, add: { imports: [FakePreview] } });
    plan = TestBed.inject(PlanStore);
    editor = TestBed.inject(EditorStore);
    editor.viewMode.set('2d');
  });

  afterEach(() => {
    vi.useRealTimers();
    fixture?.destroy();
  });

  it('loads the plan named in the route', async () => {
    await open(saved.id);
    expect(plan.plan().id).toBe(saved.id);
    expect(el.querySelector<HTMLInputElement>('.plan-name')?.value).toBe('Kitchen');
    expect(el.querySelector('app-plan-canvas')).not.toBeNull();
    expect(editor.tool()).toBe('select');
  });

  it('starts empty plans in the wall tool', async () => {
    const blank = { ...createStarterPlan('Blank'), walls: [], nodes: [], openings: [], rooms: [] };
    await repo.save(blank);
    await open(blank.id);
    expect(editor.tool()).toBe('wall');
  });

  it('shows a not-found state for an unknown id', async () => {
    await open('nope');
    expect(el.textContent).toContain('Plan not found');
    expect(el.querySelector('app-plan-canvas')).toBeNull();
  });

  describe('keyboard shortcuts', () => {
    beforeEach(() => open(saved.id));

    it('switches tools', () => {
      press('w');
      expect(editor.tool()).toBe('wall');
      press('Escape'); // ends the (empty) wall chain and returns to select
      press('d');
      expect(editor.tool()).toBe('door');
      press('v');
      expect(editor.tool()).toBe('select');
    });

    it('undoes and redoes', () => {
      plan.update((d) => {
        d.name = 'Changed';
      });
      press('z', { ctrlKey: true });
      expect(plan.plan().name).toBe('Kitchen');
      press('y', { ctrlKey: true });
      expect(plan.plan().name).toBe('Changed');
      press('z', { ctrlKey: true, shiftKey: false });
      press('Z', { ctrlKey: true, shiftKey: true });
      expect(plan.plan().name).toBe('Changed');
    });

    it('deletes, rotates and nudges the selection', () => {
      editor.select([{ kind: 'furniture', id: 'f1' }]);
      press('r');
      expect(plan.plan().furniture[0].rotation).toBe(90);
      press('ArrowRight', { shiftKey: true });
      expect(plan.plan().furniture[0].x).toBeGreaterThan(150);
      press('Delete');
      expect(plan.plan().furniture).toEqual([]);
    });

    it('cycles view modes with 3', () => {
      press('3');
      expect(editor.viewMode()).toBe('split');
      expect(el.querySelector('.fake-preview')).not.toBeNull();
      press('3');
      expect(editor.viewMode()).toBe('3d');
      press('3');
      expect(editor.viewMode()).toBe('2d');
    });

    it('toggles the shortcut help', () => {
      press('?');
      expect(el.querySelector('.modal')?.textContent).toContain('Keyboard shortcuts');
      press('Escape');
      expect(el.querySelector('.modal')).toBeNull();
    });

    it('ignores shortcuts while typing in a text field', () => {
      editor.select([{ kind: 'furniture', id: 'f1' }]);
      const name = el.querySelector<HTMLInputElement>('.plan-name')!;
      press('w', {}, name);
      press('Delete', {}, name);
      expect(editor.tool()).toBe('select');
      expect(plan.plan().furniture).toHaveLength(1);
    });
  });

  it('autosaves once, about a second after the last change', async () => {
    await open(saved.id);
    const save = vi.spyOn(repo, 'save');
    vi.useFakeTimers();
    plan.update((d) => {
      d.name = 'One';
    });
    TestBed.tick();
    vi.advanceTimersByTime(600);
    plan.update((d) => {
      d.name = 'Two';
    });
    TestBed.tick();
    vi.advanceTimersByTime(999);
    expect(save).not.toHaveBeenCalled();
    expect(el.querySelector('.save')?.textContent).toContain('Unsaved');
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await Promise.resolve();
    expect((await repo.get(saved.id))?.name).toBe('Two');
  });

  it('saves pending changes when leaving the page', async () => {
    await open(saved.id);
    plan.update((d) => {
      d.name = 'Left early';
    });
    TestBed.tick();
    fixture.destroy();
    await Promise.resolve();
    expect((await repo.get(saved.id))?.name).toBe('Left early');
  });
});
