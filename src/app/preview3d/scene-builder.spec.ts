import * as THREE from 'three';
import { attachRoomMeta, detectRooms } from '../geometry/room-detection';
import { wallSegments } from '../geometry/wall-geometry';
import { createEmptyPlan, createFurniture } from '../model/defaults';
import { catalogItem } from '../model/catalog';
import { EXTERIOR_WALL_COLOR } from '../model/palettes';
import { Plan } from '../model/plan.model';
import { squareRoom } from '../testing/fixtures';
import { FurnitureMeshFactory } from './furniture-meshes';
import { buildPlanScene, disposePlanScene, M, ModelResolver } from './scene-builder';

function floorOf(scene: { group: THREE.Group }): THREE.Mesh {
  let floor: THREE.Mesh | undefined;
  scene.group.traverse((o) => {
    if (!floor && o instanceof THREE.Mesh && o.name.startsWith('floor:')) floor = o;
  });
  return floor!;
}

describe('buildPlanScene', () => {
  const factory = new FurnitureMeshFactory();
  afterAll(() => factory.dispose());

  function build(edit: (plan: Plan, walls: string[]) => void = () => {}, models?: ModelResolver) {
    const plan = createEmptyPlan();
    const walls = squareRoom(plan, 400, 300);
    plan.rooms.push({ id: 'r', anchor: { x: 200, y: 150 }, name: 'Den', floorColor: '#112233', wallColor: '#445566' });
    edit(plan, walls);
    const rooms = attachRoomMeta(detectRooms(plan), plan.rooms);
    return { plan, walls, scene: buildPlanScene(plan, rooms, wallSegments(plan), factory, models) };
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

  it('lifts stacked and wall items and hangs ceiling items from the ceiling', () => {
    const { scene } = build((p) => {
      p.furniture.push({ ...createFurniture('table-lamp', { x: 120, y: 80 }), id: 'lamp', elevation: 75 });
      p.furniture.push({ ...createFurniture('pendant', { x: 200, y: 150 }), id: 'pendant' });
    });
    expect(scene.group.getObjectByName('furniture:lamp')!.position.y).toBeCloseTo(0.75);
    const pendant = scene.group.getObjectByName('furniture:pendant')!;
    expect(pendant.position.y).toBeCloseTo(2.4 - catalogItem('pendant').height * M);
  });

  it('attaches wall items to their wall for the cutaway', () => {
    const { scene } = build((p) => {
      const art = { ...createFurniture('art-small', { x: 200, y: 0 }), id: 'art' };
      art.y = 5 + art.depth / 2;
      p.furniture.push(art);
    });
    const art = scene.group.getObjectByName('furniture:art')!;
    const holders = scene.walls.filter((w) => w.attached.includes(art));
    expect(holders).toHaveLength(1);
    expect(holders[0].mid.y).toBeCloseTo(0);
    expect(art.position.y).toBeCloseTo((catalogItem('art-small').defaultElevation! - catalogItem('art-small').height / 2) * M);
  });

  it('gives patterned floors a shared, tiling texture tinted by the floor color', () => {
    const plain = floorOf(build().scene);
    expect((plain.material as THREE.MeshStandardMaterial).map).toBeNull();
    const first = floorOf(build((p) => (p.rooms[0].floorMaterial = 'wood')).scene);
    const second = floorOf(build((p) => (p.rooms[0].floorMaterial = 'wood')).scene);
    const material = first.material as THREE.MeshStandardMaterial;
    expect(material.map).not.toBeNull();
    expect(material.map).toBe((second.material as THREE.MeshStandardMaterial).map);
    expect(material.map!.wrapS).toBe(THREE.RepeatWrapping);
    expect(material.color.getHexString()).toBe(build().plan.rooms[0].floorColor.slice(1));
  });

  it('puts a downward-facing ceiling over each room in its ceiling color', () => {
    const { scene } = build((p) => (p.rooms[0].ceilingColor = '#abcdef'));
    const ceilings: THREE.Mesh[] = [];
    scene.group.traverse((o) => o instanceof THREE.Mesh && o.name.startsWith('ceiling:') && ceilings.push(o));
    expect(ceilings).toHaveLength(1);
    const ceiling = ceilings[0];
    expect(ceiling.position.y).toBeCloseTo(2.4, 2);
    expect((ceiling.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('abcdef');
    expect(ceiling.castShadow).toBe(false);
    ceiling.updateMatrixWorld();
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(ceiling.matrixWorld);
    expect(normal.y).toBeCloseTo(-1);
  });

  describe('trim', () => {
    const trimOf = (scene: ReturnType<typeof build>['scene'], wallId: string) => {
      const group = scene.walls.find((w) => w.id === wallId)!.group.getObjectByName('trim')!;
      return group.children as THREE.Mesh[];
    };

    it('runs baseboards along the room side only, in the trim color', () => {
      const { scene, walls } = build((p) => (p.rooms[0].trimColor = '#123123'));
      const pieces = trimOf(scene, walls[1]);
      expect(pieces).toHaveLength(1);
      expect((pieces[0].material as THREE.MeshStandardMaterial).color.getHexString()).toBe('123123');
      expect(pieces[0].position.y).toBeCloseTo(0.05);
      // The right wall's room is on its front (+z) side.
      expect(pieces[0].position.z).toBeGreaterThan(0);
    });

    it('adds crown molding when the room asks for it', () => {
      const { scene, walls } = build((p) => (p.rooms[0].crownMolding = true));
      const tops = trimOf(scene, walls[1]).map((m) => m.position.y);
      expect(tops.some((y) => Math.abs(y - (2.4 - 0.04)) < 1e-6)).toBe(true);
    });

    it('frames doors with casings and skips the baseboard across the doorway', () => {
      const { scene, walls } = build((p, w) =>
        p.openings.push({ id: 'd', wallId: w[1], kind: 'door', offset: 150, width: 80, height: 200, sillHeight: 0 }),
      );
      const pieces = trimOf(scene, walls[1]);
      // Two baseboards beside the door, two side casings and a head casing.
      expect(pieces).toHaveLength(5);
      const head = pieces.find((m) => Math.abs(m.position.y - 2.035) < 1e-6);
      expect(head).toBeDefined();
    });
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

  describe('uploaded models', () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    const resolver: ModelResolver = (id) => (id === 'm1' ? { object: source, orientation: { x: 0, y: 0, z: 0 } } : undefined);
    const chair = (modelId?: string) => ({ ...createFurniture('office-chair', { x: 200, y: 150 }), id: 'f', modelId });
    const meshesOf = (o: THREE.Object3D) => {
      const meshes: THREE.Mesh[] = [];
      o.traverse((c) => c instanceof THREE.Mesh && meshes.push(c));
      return meshes;
    };

    it('draws an item with a loaded model, fitted to its size', () => {
      const { scene, plan } = build((p) => p.furniture.push(chair('m1')), resolver);
      const f = scene.group.getObjectByName('furniture:f')!;
      expect(meshesOf(f).map((m) => m.geometry)).toEqual([source.geometry]);
      f.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(f).getSize(new THREE.Vector3());
      const item = plan.furniture[0];
      expect(size.x).toBeCloseTo(item.width * M);
      expect(size.y).toBeCloseTo(item.height * M);
      expect(size.z).toBeCloseTo(item.depth * M);
    });

    it('falls back to the built-in model when the model is not available', () => {
      const { scene } = build((p) => p.furniture.push(chair('unknown')), resolver);
      const meshes = meshesOf(scene.group.getObjectByName('furniture:f')!);
      expect(meshes.length).toBeGreaterThan(1);
      expect(meshes.some((m) => m.geometry === source.geometry)).toBe(false);
    });

    it('leaves the shared model geometry alive when the scene is disposed', () => {
      const { scene } = build((p) => p.furniture.push(chair('m1')), resolver);
      const spy = vi.fn();
      source.geometry.addEventListener('dispose', spy);
      disposePlanScene(scene);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
