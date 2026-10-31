import * as THREE from 'three';
import { boxGlb } from '../testing/glb';
import { ModelCache, parseModel } from './model-cache';

describe('parseModel', () => {
  it('reads a GLB into an object with its mesh and size', async () => {
    const object = await parseModel(boxGlb([0, 0, 0], [0.4, 1.2, 0.6]));
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.4);
    expect(size.y).toBeCloseTo(1.2);
    expect(size.z).toBeCloseTo(0.6);
  });

  it('rejects files that are not glTF', async () => {
    await expect(parseModel(new TextEncoder().encode('not a model').buffer as ArrayBuffer)).rejects.toThrow();
  });
});

describe('ModelCache', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('loads each model once and reports whether anything new arrived', async () => {
    const cache = new ModelCache();
    const bytes = vi.fn(async () => boxGlb());
    expect(await cache.load(['a', 'a'], bytes)).toBe(true);
    expect(cache.get('a')).toBeInstanceOf(THREE.Object3D);
    expect(await cache.load(['a'], bytes)).toBe(false);
    expect(bytes).toHaveBeenCalledTimes(1);
    cache.dispose();
  });

  it('remembers models that fail or are gone, without retrying', async () => {
    const cache = new ModelCache();
    const bytes = vi.fn(async (id: string) => (id === 'broken' ? new ArrayBuffer(4) : null));
    expect(await cache.load(['broken', 'gone'], bytes)).toBe(false);
    expect(cache.has('broken')).toBe(true);
    expect(cache.get('broken')).toBeUndefined();
    expect(cache.get('gone')).toBeUndefined();
    await cache.load(['broken', 'gone'], bytes);
    expect(bytes).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('drops models that finish loading after dispose', async () => {
    const cache = new ModelCache();
    const load = cache.load(['a'], async () => boxGlb());
    cache.dispose();
    expect(await load).toBe(false);
    expect(cache.get('a')).toBeUndefined();
  });
});
