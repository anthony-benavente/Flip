import * as THREE from 'three';
import { attachRoomMeta, detectRooms } from '../geometry/room-detection';
import { wallSegments } from '../geometry/wall-geometry';
import { createEmptyPlan, createFurniture } from '../model/defaults';
import { squareRoom } from '../testing/fixtures';
import { FurnitureMeshFactory } from './furniture-meshes';
import { buildPlanScene, M } from './scene-builder';
import { addOutline, findTagged, localBounds, pickFromHits } from './scene-picking';

describe('scene picking', () => {
  const factory = new FurnitureMeshFactory();
  afterAll(() => factory.dispose());

  function build() {
    const plan = createEmptyPlan();
    const walls = squareRoom(plan, 400, 300);
    plan.furniture.push({ ...createFurniture('box', { x: 120, y: 80 }, 0), id: 'f' });
    plan.openings.push({ id: 'w', wallId: walls[0], kind: 'window', offset: 300, width: 100, height: 120, sillHeight: 90 });
    const rooms = attachRoomMeta(detectRooms(plan), plan.rooms);
    const scene = buildPlanScene(plan, rooms, wallSegments(plan), factory);
    scene.group.updateMatrixWorld(true);
    return { scene };
  }

  /** Casts a ray straight down onto plan point (x, y) in cm. */
  function pickDown(group: THREE.Object3D, x: number, y: number) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x * M, 10, y * M), new THREE.Vector3(0, -1, 0));
    return pickFromHits(ray.intersectObject(group, true));
  }

  it('picks furniture but not walls or floors', () => {
    const { scene } = build();
    expect(pickDown(scene.group, 120, 80)).toEqual({ kind: 'furniture', id: 'f' });
    expect(pickDown(scene.group, 400, 150)).toBeNull();
    expect(pickDown(scene.group, 300, 200)).toBeNull();
    expect(pickDown(scene.group, 900, 900)).toBeNull();
  });

  it('picks a window through its wall', () => {
    const { scene } = build();
    // Horizontal ray from inside the room toward the top wall, at window height.
    const ray = new THREE.Raycaster(new THREE.Vector3(300 * M, 1.4, 150 * M), new THREE.Vector3(0, 0, -1));
    expect(pickFromHits(ray.intersectObject(scene.group, true))).toEqual({ kind: 'opening', id: 'w' });
  });

  it('skips hidden objects', () => {
    const { scene } = build();
    const item = scene.group.getObjectByName('furniture:f')!;
    // A second item in the same spot; the hidden one in front of it must not block it.
    const other = item.clone();
    other.userData['pick'] = { kind: 'furniture', id: 'other' };
    scene.group.add(other);
    item.visible = false;
    scene.group.updateMatrixWorld(true);
    expect(pickDown(scene.group, 120, 80)).toEqual({ kind: 'furniture', id: 'other' });
  });

  it('outlines a selected item with a box that turns with it, ignored by later picks', () => {
    const { scene } = build();
    const [item] = findTagged(scene.group, [{ kind: 'furniture', id: 'f' }]);
    const before = localBounds(item);
    item.rotation.y = Math.PI / 4;
    const after = localBounds(item);
    expect(after.min.distanceTo(before.min)).toBeCloseTo(0);
    expect(after.max.distanceTo(before.max)).toBeCloseTo(0);

    const material = new THREE.LineBasicMaterial();
    const line = addOutline(item, material)!;
    expect(line.parent).toBe(item);
    expect(localBounds(item).equals(after)).toBe(true);
    item.updateMatrixWorld(true);
    expect(pickDown(scene.group, 120, 80)).toEqual({ kind: 'furniture', id: 'f' });
    material.dispose();
  });

  it('outlines a trimmed uploaded model along the item, not the trimmed-off parts', () => {
    const plan = createEmptyPlan();
    plan.furniture.push({ ...createFurniture('box', { x: 0, y: 0 }, 0), id: 'f', width: 100, depth: 50, height: 80, modelId: 'm' });
    // A model with a stray part far off to the right, trimmed away.
    const source = new THREE.Group();
    const part = (x: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
      mesh.position.x = x;
      source.add(mesh);
    };
    part(0);
    part(9);
    const trim = { left: 0, right: 0.9, front: 0, back: 0, top: 0, bottom: 0 };
    const scene = buildPlanScene(plan, [], [], factory, () => ({ object: source, orientation: { x: 0, y: 0, z: 0 }, trim }));
    const [item] = findTagged(scene.group, [{ kind: 'furniture', id: 'f' }]);
    const line = addOutline(item, new THREE.LineBasicMaterial())!;
    scene.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(line);
    // The item's 1 m × 0.8 m × 0.5 m box plus the 1 cm margin, scaled into place.
    expect(box.min.x).toBeCloseTo(-0.5, 1);
    expect(box.max.x).toBeCloseTo(0.5, 1);
    expect(box.max.y).toBeCloseTo(0.8, 1);
    expect(box.max.z).toBeCloseTo(0.25, 1);
  });
});
