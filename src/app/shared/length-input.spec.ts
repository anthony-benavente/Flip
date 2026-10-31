import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CM_PER_FOOT, CM_PER_INCH } from '../geometry/units';
import { LengthInput } from './length-input';

describe('LengthInput', () => {
  let fixture: ComponentFixture<LengthInput>;
  let input: HTMLInputElement;
  let emitted: number[];

  const type = (text: string) => {
    input.dispatchEvent(new FocusEvent('focus'));
    input.value = text;
    input.dispatchEvent(new Event('input'));
    // The browser runs change detection after every event listener.
    fixture.detectChanges();
  };
  const press = (key: string) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key }));
    fixture.detectChanges();
  };
  const blur = () => {
    input.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(LengthInput);
    fixture.componentRef.setInput('value', 12 * CM_PER_FOOT + 6 * CM_PER_INCH);
    fixture.componentRef.setInput('units', 'imperial');
    emitted = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
  });

  it('shows the formatted value', () => {
    expect(input.value).toBe(`12' 6"`);
  });

  it('follows unit changes', () => {
    fixture.componentRef.setInput('units', 'metric');
    fixture.detectChanges();
    expect(input.value).toBe('3.81 m');
  });

  it('emits the parsed length on Enter and reformats the text', () => {
    type('10 3');
    press('Enter');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toBeCloseTo(10 * CM_PER_FOOT + 3 * CM_PER_INCH);
    expect(input.value).toBe(`10' 3"`);
  });

  it('emits on blur too', () => {
    type('2m');
    blur();
    expect(emitted).toEqual([200]);
  });

  it('flags invalid input on Enter without emitting', () => {
    type('banana');
    press('Enter');
    expect(emitted).toEqual([]);
    expect(input.classList).toContain('invalid');
    // Fixing the text clears the flag.
    type('9');
    fixture.detectChanges();
    expect(input.classList).not.toContain('invalid');
  });

  it('reverts invalid input on blur', () => {
    type('banana');
    blur();
    expect(emitted).toEqual([]);
    expect(input.value).toBe(`12' 6"`);
    expect(input.classList).not.toContain('invalid');
  });

  it('rejects values outside min and max', () => {
    fixture.componentRef.setInput('min', 50);
    fixture.componentRef.setInput('max', 100);
    type('10cm');
    press('Enter');
    type('500cm');
    press('Enter');
    expect(emitted).toEqual([]);
  });

  it('reverts on Escape', () => {
    type('3');
    press('Escape');
    blur();
    expect(emitted).toEqual([]);
    expect(input.value).toBe(`12' 6"`);
  });

  it('does not emit when the value is unchanged', () => {
    type(`12' 6"`);
    press('Enter');
    expect(emitted).toEqual([]);
  });
});
