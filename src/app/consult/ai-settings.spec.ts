import { TestBed } from '@angular/core/testing';
import { AiSettings } from './ai-settings';

function settingsFor(saved: unknown): AiSettings {
  localStorage.clear();
  if (saved !== undefined) localStorage.setItem('flip.ai', JSON.stringify(saved));
  TestBed.resetTestingModule();
  return TestBed.inject(AiSettings);
}

describe('AiSettings screenshots', () => {
  afterEach(() => localStorage.clear());

  it('defaults to the corner view, which is what colors and decor need', () => {
    expect(settingsFor(undefined).config().screenshots).toBe('corner');
  });

  it('reads the saved choice and ignores junk', () => {
    expect(settingsFor({ screenshots: 'all' }).config().screenshots).toBe('all');
    expect(settingsFor({ screenshots: 'off' }).config().screenshots).toBe('off');
    expect(settingsFor({ screenshots: 'sideways' }).config().screenshots).toBe('corner');
  });

  it('turns an old on/off setting into a mode', () => {
    expect(settingsFor({ vision: false }).config().screenshots).toBe('off');
    expect(settingsFor({ vision: true }).config().screenshots).toBe('corner');
  });

  it('saves a change', () => {
    const settings = settingsFor(undefined);
    settings.update({ screenshots: 'all' });
    expect(JSON.parse(localStorage.getItem('flip.ai')!).screenshots).toBe('all');
  });
});
