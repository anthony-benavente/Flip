/**
 * Clicking objects in the 3D view: which plan element an object stands for, and the outline drawn
 * around selected elements. Renderer-free, so it runs (and is tested) in Node.
 */
import * as THREE from 'three';
import type { SelectionItem } from '../state/editor.store';

/** `userData` key holding the `SelectionItem` an object stands for. */
export const PICK = 'pick';
/**
 * `userData` key holding a furniture item's box in meters (`{ w, d, h }`), standing on the
 * object's origin. Outlines use it rather than the meshes, which a trimmed uploaded model overhangs.
 */
export const ITEM_BOX = 'itemBox';
const OUTLINE = 'outline';

export interface ItemBox {
  w: number;
  d: number;
  h: number;
}

export function tagPick<T extends THREE.Object3D>(object: T, item: SelectionItem): T {
  object.userData[PICK] = item;
  return object;
}

/**
 * The element under the first visible hit: the hit object's own tag or its nearest tagged ancestor.
 * Only furniture, doors and windows are tagged, so a hit on a wall or floor picks nothing.
 * Hits on hidden objects (items hung on a cut-away wall) are skipped.
 */
export function pickFromHits(hits: THREE.Intersection[]): SelectionItem | null {
  for (const hit of hits) {
    let item: SelectionItem | null = null;
    let visible = true;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      if (!o.visible) {
        visible = false;
        break;
      }
      item ??= (o.userData[PICK] as SelectionItem | undefined) ?? null;
    }
    if (visible) return item;
  }
  return null;
}

/** Objects in `root` tagged with any of `items`. */
export function findTagged(root: THREE.Object3D, items: SelectionItem[]): THREE.Object3D[] {
  const wanted = new Set(items.map((s) => `${s.kind}:${s.id}`));
  const found: THREE.Object3D[] = [];
  root.traverse((o) => {
    const item = o.userData[PICK] as SelectionItem | undefined;
    if (item && wanted.has(`${item.kind}:${item.id}`)) found.push(o);
  });
  return found;
}

/** Box around an object's meshes in the object's own frame, so it turns with the object. */
export function localBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  const toLocal = object.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const m = new THREE.Matrix4();
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData[OUTLINE]) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox!.clone().applyMatrix4(m.multiplyMatrices(toLocal, o.matrixWorld)));
  });
  return box;
}

/** An item's box in the object's own frame, undoing the object's scale (fitted models are scaled). */
function itemBounds(object: THREE.Object3D, { w, d, h }: ItemBox): THREE.Box3 {
  const s = object.scale;
  return new THREE.Box3(new THREE.Vector3(-w / 2 / s.x, 0, -d / 2 / s.z), new THREE.Vector3(w / 2 / s.x, h / s.y, d / 2 / s.z));
}

/**
 * A box of lines around a selected object, added as its child so it follows the object's scale
 * and visibility: the item's box for furniture, otherwise the box around its meshes. `null` for an
 * empty object.
 */
export function addOutline(object: THREE.Object3D, material: THREE.LineBasicMaterial): THREE.LineSegments | null {
  const item = object.userData[ITEM_BOX] as ItemBox | undefined;
  const box = item ? itemBounds(object, item) : localBounds(object);
  if (box.isEmpty()) return null;
  box.expandByScalar(0.01);
  const size = box.getSize(new THREE.Vector3());
  const solid = new THREE.BoxGeometry(size.x, size.y, size.z);
  const line = new THREE.LineSegments(new THREE.EdgesGeometry(solid), material);
  solid.dispose();
  line.position.copy(box.getCenter(new THREE.Vector3()));
  line.userData[OUTLINE] = true;
  line.renderOrder = 999;
  line.raycast = () => {};
  object.add(line);
  return line;
}
