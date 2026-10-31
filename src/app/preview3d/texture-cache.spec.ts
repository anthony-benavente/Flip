import * as THREE from 'three';
import { ImageSource, TextureCache } from './texture-cache';

describe('TextureCache', () => {
  const source = (files: Record<string, ArrayBuffer | null>): ImageSource => ({
    image: (id) => (id in files ? { mimeType: 'image/png' } : undefined),
    bytes: async (id) => files[id] ?? null,
  });

  it('decodes each image once and shares the texture', async () => {
    const decode = vi.fn(async () => new THREE.Texture());
    const cache = new TextureCache(decode);
    const files = source({ a: new ArrayBuffer(4) });
    expect(await cache.load(['a', 'a'], files)).toBe(true);
    expect(await cache.load(['a'], files)).toBe(false);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(cache.get('a')).toBeInstanceOf(THREE.Texture);
    cache.dispose();
  });

  it('remembers images that are gone or fail to decode, without retrying', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const decode = vi.fn(async () => {
      throw new Error('bad image');
    });
    const cache = new TextureCache(decode);
    expect(await cache.load(['gone', 'broken'], source({ gone: null, broken: new ArrayBuffer(4) }))).toBe(false);
    expect(cache.has('gone')).toBe(true);
    expect(cache.get('broken')).toBeUndefined();
    await cache.load(['broken'], source({ broken: new ArrayBuffer(4) }));
    expect(decode).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('frees textures on dispose, including ones that finish loading afterwards', async () => {
    const textures: THREE.Texture[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const cache = new TextureCache(async () => {
      await gate;
      const t = new THREE.Texture();
      vi.spyOn(t, 'dispose');
      textures.push(t);
      return t;
    });
    const loading = cache.load(['late'], source({ late: new ArrayBuffer(4) }));
    cache.dispose();
    release();
    expect(await loading).toBe(false);
    expect(textures[0].dispose).toHaveBeenCalled();
    expect(cache.get('late')).toBeUndefined();
  });
});
