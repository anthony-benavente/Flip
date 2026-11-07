import * as THREE from 'three';
import { ModelOrientation, ModelTrim, NO_TRIM } from '../model/custom-model';

/** Marks meshes whose geometry and materials belong to a cached model, so scene disposal skips them. */
export const SHARED_MODEL = 'sharedModel';

/** Axes thinner than this (meters) are left unscaled, so flat models do not blow up. */
const MIN_EXTENT = 1e-4;

/**
 * Places an instance of an uploaded model into a furniture item's box, the same frame the
 * built-in models use: centered on x/z, sitting on y = 0, back at -z. The model is turned by
 * `orientation`, its bounds are cut in by `trim`, and those bounds are stretched on each axis to
 * exactly `w` × `h` × `d` meters; anything trimmed off sticks out of the box.
 * Geometry and materials are shared with `source`.
 */
export function fitModelToBox(
  source: THREE.Object3D,
  orientation: ModelOrientation,
  w: number,
  d: number,
  h: number,
  trim: ModelTrim = NO_TRIM,
): THREE.Group {
  const oriented = new THREE.Group();
  oriented.add(source.clone(true));
  oriented.rotation.set((orientation.x * Math.PI) / 2, (orientation.y * Math.PI) / 2, (orientation.z * Math.PI) / 2, 'XYZ');
  oriented.updateMatrixWorld(true);

  const fitted = new THREE.Group();
  fitted.add(oriented);
  const box = new THREE.Box3().setFromObject(oriented, true);
  if (box.isEmpty()) return fitted;

  const full = box.getSize(new THREE.Vector3());
  box.min.add(new THREE.Vector3(full.x * trim.left, full.y * trim.bottom, full.z * trim.back));
  box.max.sub(new THREE.Vector3(full.x * trim.right, full.y * trim.top, full.z * trim.front));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  oriented.position.set(-center.x, -box.min.y, -center.z);
  const fit = (target: number, extent: number) => (extent > MIN_EXTENT ? target / extent : 1);
  fitted.scale.set(fit(w, size.x), fit(h, size.y), fit(d, size.z));

  fitted.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.userData[SHARED_MODEL] = true;
    }
  });
  return fitted;
}
