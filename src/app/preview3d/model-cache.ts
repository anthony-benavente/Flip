import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Parses a glTF or GLB file. Rejects for files that are malformed or reference external resources. */
export async function parseModel(data: ArrayBuffer): Promise<THREE.Object3D> {
  const gltf = await new GLTFLoader().parseAsync(data, '');
  return gltf.scene;
}

/**
 * Parsed uploaded models by id, shared by every scene build. Instances are made with
 * `fitModelToBox`, which clones the object but shares geometry and materials, so they are
 * freed here, not with the scene.
 */
export class ModelCache {
  /** `null` marks a model that failed to load, so it is not retried on every rebuild. */
  private readonly loaded = new Map<string, THREE.Object3D | null>();
  private readonly pending = new Map<string, Promise<boolean>>();
  private disposed = false;

  get(id: string): THREE.Object3D | undefined {
    return this.loaded.get(id) ?? undefined;
  }

  /** True once a model has loaded, failed, or started loading. */
  has(id: string): boolean {
    return this.loaded.has(id) || this.pending.has(id);
  }

  /** Loads models that are not cached yet. Resolves true if any of them loaded. */
  async load(ids: Iterable<string>, bytes: (id: string) => Promise<ArrayBuffer | null>): Promise<boolean> {
    const jobs = [...new Set(ids)].filter((id) => !this.has(id)).map((id) => {
      const job = bytes(id)
        .then((data) => (data ? parseModel(data) : null))
        .catch((e) => {
          console.warn(`Could not load 3D model ${id}.`, e);
          return null;
        })
        .then((object) => {
          this.pending.delete(id);
          if (this.disposed) {
            if (object) disposeObject(object);
            return false;
          }
          this.loaded.set(id, object);
          return !!object;
        });
      this.pending.set(id, job);
      return job;
    });
    return (await Promise.all(jobs)).some(Boolean);
  }

  dispose(): void {
    this.disposed = true;
    for (const object of this.loaded.values()) if (object) disposeObject(object);
    this.loaded.clear();
  }
}

/** Frees the geometry, materials and textures of a parsed model. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
