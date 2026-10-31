import * as THREE from 'three';

/** Where the 3D view finds uploaded art images: metadata (type, and whether it still exists) and file bytes. */
export interface ImageSource {
  image(id: string): { mimeType: string } | undefined;
  bytes(id: string): Promise<ArrayBuffer | null>;
}

/** Decodes an image file into a texture, flipped for WebGL since ImageBitmaps ignore `flipY`. */
export async function decodeTexture(data: ArrayBuffer, mimeType: string): Promise<THREE.Texture> {
  const bitmap = await createImageBitmap(new Blob([data], { type: mimeType }), { imageOrientation: 'flipY' });
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Decoded art images by id, shared by every scene build. Scenes make their own materials around
 * these textures, so the textures are freed here, not with the scene.
 */
export class TextureCache {
  /** `null` marks an image that failed to load, so it is not retried on every rebuild. */
  private readonly loaded = new Map<string, THREE.Texture | null>();
  private readonly pending = new Map<string, Promise<boolean>>();
  private disposed = false;

  constructor(private readonly decode: typeof decodeTexture = decodeTexture) {}

  get(id: string): THREE.Texture | undefined {
    return this.loaded.get(id) ?? undefined;
  }

  /** True once an image has loaded, failed, or started loading. */
  has(id: string): boolean {
    return this.loaded.has(id) || this.pending.has(id);
  }

  /** Loads images that are not cached yet. Resolves true if any of them loaded. */
  async load(ids: Iterable<string>, source: ImageSource): Promise<boolean> {
    const jobs = [...new Set(ids)].filter((id) => !this.has(id)).map((id) => {
      const job = source
        .bytes(id)
        .then((data) => {
          const meta = source.image(id);
          return data && meta ? this.decode(data, meta.mimeType) : null;
        })
        .catch((e) => {
          console.warn(`Could not load picture ${id}.`, e);
          return null;
        })
        .then((texture) => {
          this.pending.delete(id);
          if (this.disposed) {
            texture?.dispose();
            return false;
          }
          this.loaded.set(id, texture);
          return !!texture;
        });
      this.pending.set(id, job);
      return job;
    });
    return (await Promise.all(jobs)).some(Boolean);
  }

  dispose(): void {
    this.disposed = true;
    for (const texture of this.loaded.values()) {
      if (!texture) continue;
      (texture.image as ImageBitmap | undefined)?.close?.();
      texture.dispose();
    }
    this.loaded.clear();
  }
}
