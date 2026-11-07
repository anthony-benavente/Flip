import * as THREE from 'three';
import { fitModelToBox, SHARED_MODEL } from './model-fit';

describe('fitModelToBox', () => {
  /** A box mesh spanning `min`..`max`, wrapped in a parent like a parsed glTF scene. */
  function model(min: THREE.Vector3Tuple, max: THREE.Vector3Tuple): THREE.Object3D {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new THREE.MeshStandardMaterial());
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const root = new THREE.Group();
    root.add(mesh);
    return root;
  }

  const bounds = (o: THREE.Object3D) => {
    o.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(o, true);
  };

  function expectBox(box: THREE.Box3, min: THREE.Vector3Tuple, max: THREE.Vector3Tuple) {
    box.min.toArray().forEach((v, i) => expect(v).toBeCloseTo(min[i], 5));
    box.max.toArray().forEach((v, i) => expect(v).toBeCloseTo(max[i], 5));
  }

  it('stretches an off-center model to fill the box, centered on x/z and standing on the floor', () => {
    const fitted = fitModelToBox(model([3, 5, -2], [5, 6, 2]), { x: 0, y: 0, z: 0 }, 0.6, 0.5, 1);
    expectBox(bounds(fitted), [-0.3, 0, -0.25], [0.3, 1, 0.25]);
  });

  it('turns the model before fitting, so a Z-up model can be stood upright', () => {
    // Tall along Z (Z-up export): 1 wide, 3 deep, 0.5 tall.
    const source = model([0, 0, 0], [1, 0.5, 3]);
    const fitted = fitModelToBox(source, { x: 3, y: 0, z: 0 }, 0.5, 0.5, 1);
    expectBox(bounds(fitted), [-0.25, 0, -0.25], [0.25, 1, 0.25]);
    // The model's long axis now runs up: the scale on Y stretches 3 m to 1 m.
    expect(fitted.scale.y).toBeCloseTo(1 / 3);
  });

  it('fits the trimmed bounds to the box, so trimmed-off parts stick out', () => {
    // 4 m wide, 1 m tall, 2 m deep; trim a quarter off the left, half the depth off the front.
    const trim = { left: 0.25, right: 0, front: 0.5, back: 0, top: 0, bottom: 0 };
    const fitted = fitModelToBox(model([0, 0, 0], [4, 1, 2]), { x: 0, y: 0, z: 0 }, 0.6, 0.4, 1, trim);
    // Kept: x 1..4 (3 m → 0.6 m, scale 0.2) and z 0..1 (1 m → 0.4 m, scale 0.4).
    expect(fitted.scale.x).toBeCloseTo(0.2);
    expect(fitted.scale.z).toBeCloseTo(0.4);
    expectBox(bounds(fitted), [-0.5, 0, -0.2], [0.3, 1, 0.6]);
  });

  it('leaves a flat axis unscaled instead of dividing by zero', () => {
    const flat = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial());
    const fitted = fitModelToBox(flat, { x: 0, y: 0, z: 0 }, 1, 1, 0.5);
    expect(fitted.scale.toArray().every(Number.isFinite)).toBe(true);
    expect(fitted.scale.y).toBe(1);
    expectBox(bounds(fitted), [-0.5, 0, -0.5], [0.5, 0, 0.5]);
  });

  it('shares geometry and materials with the source and marks meshes as shared', () => {
    const source = model([0, 0, 0], [1, 1, 1]);
    const sourceMesh = source.children[0] as THREE.Mesh;
    const meshes: THREE.Mesh[] = [];
    fitModelToBox(source, { x: 0, y: 1, z: 0 }, 1, 1, 1).traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    expect(meshes).toHaveLength(1);
    expect(meshes[0].geometry).toBe(sourceMesh.geometry);
    expect(meshes[0].material).toBe(sourceMesh.material);
    expect(meshes[0].userData[SHARED_MODEL]).toBe(true);
    expect(meshes[0].castShadow).toBe(true);
  });

  it('returns an empty group for a model with no geometry', () => {
    const fitted = fitModelToBox(new THREE.Group(), { x: 0, y: 0, z: 0 }, 1, 1, 1);
    expect(bounds(fitted).isEmpty()).toBe(true);
  });
});
