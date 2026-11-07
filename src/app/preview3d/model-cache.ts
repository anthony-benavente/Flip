import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ModelColors } from '../model/custom-model';

/** Parses a glTF or GLB file. Rejects for files that are malformed or reference external resources. */
export async function parseModel(data: ArrayBuffer): Promise<THREE.Object3D> {
  const gltf = await new GLTFLoader().parseAsync(data, '');
  return gltf.scene;
}

/** A material of a parsed model as the upload dialog lists it. */
export interface ModelMaterialInfo {
  /** Position among the model's distinct materials; the key in `ModelColors`. */
  key: string;
  name: string;
  /** The file's own color (`#rrggbb`), before any replacement. */
  color: string;
  textured: boolean;
}

/** What a recolored material gave up, so a replacement can be undone. */
const ORIGINAL = 'originalLook';
interface OriginalLook {
  color: THREE.Color;
  map: THREE.Texture | null;
}

type ColoredMaterial = THREE.Material & { color: THREE.Color; map: THREE.Texture | null };

const hasColor = (m: THREE.Material): m is ColoredMaterial => (m as Partial<ColoredMaterial>).color instanceof THREE.Color;

/** The distinct materials of a model in traversal order, the order `ModelColors` keys refer to. */
function distinctMaterials(root: THREE.Object3D): ColoredMaterial[] {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) seen.add(m);
  });
  return [...seen].filter(hasColor);
}

function originalLook(m: ColoredMaterial): OriginalLook {
  return (m.userData[ORIGINAL] ??= { color: m.color.clone(), map: m.map } satisfies OriginalLook);
}

/** Lists the materials of a parsed model that have a color, with the file's own colors. */
export function listMaterials(root: THREE.Object3D): ModelMaterialInfo[] {
  return distinctMaterials(root).map((m, i) => {
    const look = (m.userData[ORIGINAL] as OriginalLook | undefined) ?? { color: m.color, map: m.map };
    return { key: String(i), name: m.name.trim() || `Material ${i + 1}`, color: `#${look.color.getHexString()}`, textured: !!look.map };
  });
}

/**
 * Paints materials with the given colors and restores the rest. The materials are shared by
 * every fitted instance of the model, so this takes effect on all of them. A replaced material
 * also drops its color texture, which would otherwise tint the new color.
 */
export function applyMaterialColors(root: THREE.Object3D, colors: ModelColors | undefined): void {
  distinctMaterials(root).forEach((m, i) => {
    const color = colors?.[String(i)];
    if (!color && !m.userData[ORIGINAL]) return;
    const look = originalLook(m);
    const map = color ? null : look.map;
    if (color) m.color.set(color);
    else m.color.copy(look.color);
    if (m.map !== map) {
      m.map = map;
      m.needsUpdate = true;
    }
  });
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

  /** Paints a loaded model's materials, or restores them. A model that is not loaded is left alone. */
  recolor(id: string, colors: ModelColors | undefined): void {
    const object = this.get(id);
    if (object) applyMaterialColors(object, colors);
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
      // A recolored material set its texture aside; free that too.
      (m.userData[ORIGINAL] as OriginalLook | undefined)?.map?.dispose();
      m.dispose();
    }
  });
}
