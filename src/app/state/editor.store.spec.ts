import { TestBed } from '@angular/core/testing';
import { EditorStore } from './editor.store';

describe('EditorStore', () => {
  let editor: EditorStore;

  beforeEach(() => {
    editor = TestBed.inject(EditorStore);
  });

  it('toggles items in and out of the selection', () => {
    editor.toggle({ kind: 'wall', id: 'w1' });
    editor.toggle({ kind: 'furniture', id: 'f1' });
    expect(editor.isSelected('wall', 'w1')).toBe(true);
    // Same id but a different kind is a different item.
    expect(editor.isSelected('furniture', 'w1')).toBe(false);
    editor.toggle({ kind: 'wall', id: 'w1' });
    expect(editor.isSelected('wall', 'w1')).toBe(false);
    expect(editor.singleSelection()).toEqual({ kind: 'furniture', id: 'f1' });
  });

  it('reports a single selection only when exactly one item is selected', () => {
    expect(editor.singleSelection()).toBeNull();
    editor.select([
      { kind: 'wall', id: 'a' },
      { kind: 'wall', id: 'b' },
    ]);
    expect(editor.singleSelection()).toBeNull();
  });

  it('merges overlay patches and clears them', () => {
    editor.setOverlay({ typedLength: '1' });
    editor.setOverlay({ box: { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } } });
    expect(editor.overlay().typedLength).toBe('1');
    expect(editor.overlay().box).toBeTruthy();
    editor.clearOverlay();
    expect(editor.overlay()).toEqual({});
  });

  it('counts fit requests', () => {
    const before = editor.fitRequest();
    editor.requestFit();
    editor.requestFit();
    expect(editor.fitRequest()).toBe(before + 2);
  });
});
