import { TestBed } from '@angular/core/testing';
import { ColorPick, ColorSwatches } from './color-swatches';

describe('ColorSwatches', () => {
  const setup = (inputs: Record<string, unknown>) => {
    const fixture = TestBed.createComponent(ColorSwatches);
    fixture.componentRef.setInput('swatches', [
      { name: 'Navy', color: '#2f4a6d' },
      { name: 'Teal', color: '#2f7f80' },
    ]);
    fixture.componentRef.setInput('pickerValue', '#ffffff');
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    const picks: ColorPick[] = [];
    fixture.componentInstance.pick.subscribe((p) => picks.push(p));
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, picks };
  };

  it('marks the selected swatch and labels swatches by name', () => {
    const { el } = setup({ selected: '#2f7f80', ariaSuffix: ' for the door wall', customLabel: 'Custom door wall color' });
    const buttons = el.querySelectorAll('button.swatch');
    expect(buttons).toHaveLength(2);
    expect(el.querySelector('.swatch.active')?.getAttribute('title')).toBe('Teal');
    expect(buttons[0].getAttribute('aria-label')).toBe('Navy for the door wall');
    expect(el.querySelector('input[type=color]')?.getAttribute('aria-label')).toBe('Custom door wall color');
  });

  it('emits presets as final picks and picker changes as live picks', () => {
    const { el, picks } = setup({});
    el.querySelector<HTMLButtonElement>('.swatch[title="Navy"]')!.click();
    const picker = el.querySelector<HTMLInputElement>('input[type=color]')!;
    picker.value = '#123456';
    picker.dispatchEvent(new Event('input'));
    expect(picks).toEqual([
      { color: '#2f4a6d', live: false },
      { color: '#123456', live: true },
    ]);
  });

  it('has no swatch aria-label unless a suffix is given, so the title names it', () => {
    const { el } = setup({});
    expect(el.querySelector('.swatch')?.hasAttribute('aria-label')).toBe(false);
  });
});
