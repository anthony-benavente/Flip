import { TestBed } from '@angular/core/testing';
import { createEmptyPlan, createStarterPlan } from '../../model/defaults';
import { EditorStore } from '../../state/editor.store';
import { PlanStore } from '../../state/plan.store';
import { RoomsPanel } from './rooms-panel';

describe('RoomsPanel', () => {
  const render = (plan = createStarterPlan('Den')) => {
    TestBed.inject(PlanStore).load(plan);
    const fixture = TestBed.createComponent(RoomsPanel);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('lists each room with its area', () => {
    const { el } = render();
    const rows = el.querySelectorAll('li button');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/sq ft/);
  });

  it('selects a room when its row is clicked, and marks it pressed', () => {
    const { fixture, el } = render();
    el.querySelector<HTMLButtonElement>('li button')!.click();
    fixture.detectChanges();
    const selection = TestBed.inject(EditorStore).selection();
    expect(selection).toHaveLength(1);
    expect(selection[0].kind).toBe('room');
    expect(el.querySelector('li button')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('explains how to make a room when there are none', () => {
    const { el } = render(createEmptyPlan('Blank'));
    expect(el.querySelector('.empty')?.textContent).toContain('Draw walls');
  });
});
