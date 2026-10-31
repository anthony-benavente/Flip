import { catalogItem } from './catalog';
import { isCustomModel, modelDisplayName, modelNameFromFile, turnOrientation } from './custom-model';

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

  it('validates metadata read from files', () => {
    expect(isCustomModel(meta)).toBe(true);
    expect(isCustomModel({ ...meta, orientation: { x: 0, y: 4, z: 0 } })).toBe(false);
    expect(isCustomModel({ ...meta, byteSize: '10' })).toBe(false);
    expect(isCustomModel(null)).toBe(false);
  });
});
