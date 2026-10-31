import { comboMatches, findShortcut, HELP_ROWS, SHORTCUTS } from './shortcuts';

const key = (k: string, init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key: k, ...init });

describe('shortcuts table', () => {
  it('binds every key combination at most once', () => {
    const seen = new Map<string, string>();
    for (const s of SHORTCUTS) {
      for (const c of s.combos) {
        for (const shift of c.shift === undefined ? [true, false] : [c.shift]) {
          const id = `${c.ctrl ? 'ctrl+' : ''}${shift ? 'shift+' : ''}${c.key}`;
          expect(seen.get(id), `${id} is bound to "${seen.get(id)}" and "${s.label}"`).toBeUndefined();
          seen.set(id, s.label);
        }
      }
    }
  });

  it('lists every runnable shortcut in the help dialog', () => {
    for (const s of SHORTCUTS) {
      expect(s.label.trim()).not.toBe('');
      expect(HELP_ROWS).toContainEqual({ keys: s.keys, label: s.label });
    }
  });

  it('uses lower-case key names so matching is case-insensitive', () => {
    for (const s of SHORTCUTS) for (const c of s.combos) expect(c.key).toBe(c.key.toLowerCase());
  });

  it('matches modifiers exactly', () => {
    expect(findShortcut(key('d'))?.label).toBe('Door tool');
    expect(findShortcut(key('d', { ctrlKey: true }))?.label).toBe('Duplicate furniture');
    expect(findShortcut(key('D', { metaKey: true }))?.label).toBe('Duplicate furniture');
    expect(findShortcut(key('z', { ctrlKey: true }))?.label).toBe('Undo');
    expect(findShortcut(key('Z', { ctrlKey: true, shiftKey: true }))?.label).toBe('Redo');
    expect(findShortcut(key('w', { altKey: true }))).toBeUndefined();
    expect(findShortcut(key('q'))).toBeUndefined();
  });

  it('treats an unspecified Shift as either', () => {
    expect(comboMatches({ key: 'r' }, key('R', { shiftKey: true }))).toBe(true);
    expect(comboMatches({ key: 'z', ctrl: true, shift: false }, key('z', { ctrlKey: true, shiftKey: true }))).toBe(false);
  });
});
