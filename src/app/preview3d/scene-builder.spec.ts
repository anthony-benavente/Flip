import * as THREE from 'three';
import { attachRoomMeta, detectRooms } from '../geometry/room-detection';
import { wallSegments } from '../geometry/wall-geometry';
import { createEmptyPlan, createFurniture } from '../model/defaults';
import { EXTERIOR_WALL_COLOR } from '../model/palettes';
import { Plan } from '../model/plan.model';
import { squareRoom } from '../testing/fixtures';
import { FurnitureMeshFactory } from './furniture-meshes';
import { buildPlanScene, disposePlanScene, M } from './scene-builder';

describe('buildPlanScene', () => {
  const factory = new FurnitureMeshFactory();
  afterAll(() => factory.dispose());

  function build(edit: (plan: Plan, walls: string[]) => void = () => {}) {
    const plan = createEmptyPlan();
    const walls = squareRoom(plan, 400, 300);
    plan.rooms.push({ id: 'r', anchor: { x: 200, y: 150 }, name: 'Den', floorColor: '#112233', wallColor: '#445566' });
    edit(plan, walls);
    const rooms = attachRoomMeta(detectRooms(plan), plan.rooms);
    return { plan, walls, scene: buildPlanScene(plan, rooms, wallSegments(plan), factory) };
  }

  /** Materials of the first solid box in a wall, in BoxGeometry face order (+x, -x, +y, -y, +z, -z). */
  function faceColors(scene: ReturnType<typeof build>['scene'], wallId: string) {
    const wall = scene.walls.find((w) => w.id === wallId)!;
    const box = wall.group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    const mats = box.material as THREE.MeshStandardMaterial[];
    return { front: '#' + mats[4].color.getHexString(), back: '#' + mats[5].color.getHexString() };
  }

  it('makes one floor per room in the room color', () => {
    const { scene } = build();
    const floors = scene.group.children.filter((c) => c.name.startsWith('floor:')) as THREE.Mesh[];
    expect(floors).toHaveLength(1);
    expect((floors[0].material as THREE.MeshStandardMaterial).color.getHexString()).toBe('112233');
  });

  it('paints wall faces with the accent, then the room color, then the exterior color', () => {
    const { scene, walls } = build((plan, w) => {
      plan.walls.find((x) => x.id === w[1])!.colors = { front: '#2f4a6d' };
    });
    // Top wall runs +x: its front (normal +y) faces into the room, its back faces outside.
    expect(faceColors(scene, walls[0])).toEqual({ front: '#445566', back: EXTERIOR_WALL_COLOR });
    expect(faceColors(scene, walls[1]).front).toBe('#2f4a6d');
  });

  it('places walls at their midpoint, rotated along the wall', () => {
    const { scene, walls } = build();
    const right = scene.walls.find((w) => w.id === walls[1])!;
    expect(right.group.position.x).toBeCloseTo(400 * M);
    expect(right.group.position.z).toBeCloseTo(150 * M);
    // The right wall runs +y in the plan; rotation maps local +x onto world +Z.
    const dir = new THREE.Vector3(1, 0, 0).applyEuler(right.group.rotation);
    expect(dir.z).toBeCloseTo(1);
  });

  it('builds a hinged door leaf and a window pane inside the openings', () => {
    const { scene, walls } = build((plan, w) => {
      plan.openings.push({ id: 'd', wallId: w[0], kind: 'door', offset: 100, width: 80, height: 200, sillHeight: 0, swing: 'left' });
      plan.openings.push({ id: 'w', wallId: w[0], kind: 'window', offset: 300, width: 100, height: 120, sillHeight: 90 });
    });
    const top = scene.walls.find((w) => w.id === walls[0])!.group;
    expect(top.getObjectByName('door')).toBeDefined();
    expect(top.getObjectByName('window')).toBeDefined();
    // Solid boxes: left of door, above door, between, above window, below window, right of window.
    expect(top.children.filter((c) => c instanceof THREE.Mesh)).toHaveLength(6);
  });

  it('positions and rotates furniture in world space', () => {
    const { scene } = build((plan) => plan.furniture.push({ ...createFurniture('box', { x: 120, y: 80 }, 90), id: 'f' }));
    const f = scene.group.getObjectByName('furniture:f')!;
    expect(f.position.toArray()).toEqual([1.2, 0, 0.8]);
    // Plan rotations are clockwise on screen (y down); in world they turn about -Y.
    expect(f.rotation.y).toBeCloseTo(-Math.PI / 2);
  });

  it('bounds the walls at full height', () => {
    const { scene } = build();
    expect(scene.bounds.min.toArray()).toEqual([0, 0, 0]);
    expect(scene.bounds.max.x).toBeCloseTo(4);
    expect(scene.bounds.max.y).toBeCloseTo(2.4);
    expect(scene.bounds.max.z).toBeCloseTo(3);
  });

  it('returns an empty scene for an empty plan', () => {
    const scene = buildPlanScene(createEmptyPlan(), [], [], factory);
    expect(scene.group.children).toHaveLength(0);
    expect(scene.bounds.isEmpty()).toBe(true);
  });

  it('disposes its own materials but not the shared furniture ones', () => {
    const { scene } = build((plan) => plan.furniture.push(createFurniture('sofa-3', { x: 200, y: 150 })));
    const shared = factory.material('#7a8ca3');
    const owned = scene.materials[0];
    const ownedSpy = vi.fn();
    const sharedSpy = vi.fn();
    owned.addEventListener('dispose', ownedSpy);
    shared.addEventListener('dispose', sharedSpy);
    disposePlanScene(scene);
    expect(ownedSpy).toHaveBeenCalled();
    expect(sharedSpy).not.toHaveBeenCalled();
  });
});
