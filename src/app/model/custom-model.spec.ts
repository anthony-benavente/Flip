import { catalogItem } from './catalog';
import {
  isCustomModel,
  setModelColor,
  storedColors,
  MAX_TRIM,
  modelDisplayName,
  modelNameFromFile,
  NO_TRIM,
  setTrimSide,
  storedTrim,
  turnOrientation,
} from './custom-model';

describe('custom models', () => {
  const meta = { id: 'm', name: 'Aeron', catalogId: 'office-chair', fileName: 'a.glb', byteSize: 10, createdAt: '2026-01-01', orientation: { x: 0, y: 3, z: 1 } };

  it('names a model after its template', () => {
    expect(modelDisplayName(meta, catalogItem('office-chair'))).toBe('Office chair · Aeron');
  });

  it.each([
    ['aeron_chair.glb', 'aeron chair'],
    ['Desk-v2.GLTF', 'Desk v2'],
    ['.glb', 'Model'],
  ])('suggests a name for %s', (file, name) => {
    expect(modelNameFromFile(file)).toBe(name);
  });

  it('adds quarter turns, wrapping after four', () => {
    expect(turnOrientation({ x: 0, y: 3, z: 1 }, 'y')).toEqual({ x: 0, y: 0, z: 1 });
    expect(turnOrientation({ x: 0, y: 3, z: 1 }, 'x')).toEqual({ x: 1, y: 3, z: 1 });
  });

  it('clamps trim to 0…45% per side and stores nothing when untrimmed', () => {
    expect(setTrimSide(NO_TRIM, 'left', 0.123456).left).toBe(0.123);
    expect(setTrimSide(NO_TRIM, 'top', 0.9).top).toBe(MAX_TRIM);
    expect(setTrimSide(NO_TRIM, 'top', -1).top).toBe(0);
    expect(setTrimSide(NO_TRIM, 'top', NaN).top).toBe(0);
    expect(storedTrim(NO_TRIM)).toBeUndefined();
    expect(storedTrim({ ...NO_TRIM, back: 0.1 })).toEqual({ ...NO_TRIM, back: 0.1 });
  });

  it('validates metadata read from files', () => {
    expect(isCustomModel(meta)).toBe(true);
    expect(isCustomModel({ ...meta, trim: { ...NO_TRIM, front: 0.2 } })).toBe(true);
    expect(isCustomModel({ ...meta, trim: { ...NO_TRIM, front: 0.6 } })).toBe(false);
    expect(isCustomModel({ ...meta, trim: { left: 0.1 } })).toBe(false);
    expect(isCustomModel({ ...meta, orientation: { x: 0, y: 4, z: 0 } })).toBe(false);
    expect(isCustomModel({ ...meta, byteSize: '10' })).toBe(false);
    expect(isCustomModel(null)).toBe(false);
  });

  it('sets, clears and stores material colors', () => {
    const red = setModelColor({}, '0', '#FF0000');
    expect(red).toEqual({ '0': '#ff0000' });
    expect(setModelColor(red, '0', 'red')).toEqual({});
    expect(setModelColor(red, '0', null)).toEqual({});
    expect(storedColors({})).toBeUndefined();
    expect(storedColors(red)).toEqual(red);
  });

  it('validates stored colors', () => {
    expect(isCustomModel({ ...meta, colors: { '0': '#aabbcc' } })).toBe(true);
    expect(isCustomModel({ ...meta, colors: { '0': 'blue' } })).toBe(false);
    expect(isCustomModel({ ...meta, colors: 'x' })).toBe(false);
  });
});
