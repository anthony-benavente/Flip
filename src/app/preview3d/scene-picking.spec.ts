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
});
