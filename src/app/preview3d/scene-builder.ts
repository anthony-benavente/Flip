/**
 * Builds the three.js object graph for a plan: floors, walls with door and window openings, and
 * furniture. No renderer, camera or DOM is involved, so this runs (and is tested) in Node.
 * Coordinates: plan (x, y) in cm maps to world (X, Z) in meters, with Y up.
 */
import * as THREE from 'three';
import { Room, roomsBesideWall, wallFaceColor } from '../geometry/room-detection';
import { add, scale } from '../geometry/vec';
import { WallSegment } from '../geometry/wall-geometry';
import { catalogItem } from '../model/catalog';
import { EXTERIOR_WALL_COLOR } from '../model/palettes';
import { Opening, Plan, WallSide } from '../model/plan.model';
import { FurnitureMeshFactory } from './furniture-meshes';
import { wallPieces } from './wall-pieces';

/** cm → m */
export const M = 0.01;
export const WALL_EDGE_COLOR = '#cfc8bc';
export const DOOR_COLOR = '#b48b5e';
export const DOOR_OPEN_ANGLE = (70 * Math.PI) / 180;

export interface SceneWall {
  id: string;
  group: THREE.Group;
  /** Midpoint and unit normal on the ground plane (world X, Z). */
  mid: THREE.Vector2;
  normal: THREE.Vector2;
}

export interface PlanScene {
  group: THREE.Group;
  walls: SceneWall[];
  /** Box around walls (full height) and furniture positions; empty for an empty plan. */
  bounds: THREE.Box3;
  /** Materials created for this scene only; shared furniture materials stay with the factory. */
  materials: THREE.Material[];
}

export function buildPlanScene(plan: Plan, rooms: Room[], segments: WallSegment[], factory: FurnitureMeshFactory): PlanScene {
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const own = <T extends THREE.Material>(m: T): T => (materials.push(m), m);

  for (const room of rooms) group.add(buildFloor(room, own));

  const openingsByWall = new Map<string, Opening[]>();
  for (const o of plan.openings) openingsByWall.set(o.wallId, [...(openingsByWall.get(o.wallId) ?? []), o]);
  const walls = segments.map((seg) => {
    const wall = buildWall(seg, openingsByWall.get(seg.wall.id) ?? [], rooms, factory, own);
    group.add(wall.group);
    return wall;
  });

  for (const f of plan.furniture) {
    const model = factory.build(catalogItem(f.catalogId).shape, f.width * M, f.depth * M, f.height * M, f.color);
    model.name = `furniture:${f.id}`;
    model.position.set(f.x * M, 0, f.y * M);
    model.rotation.y = (-f.rotation * Math.PI) / 180;
    group.add(model);
  }

  const bounds = new THREE.Box3();
  for (const s of segments) {
    bounds.expandByPoint(new THREE.Vector3(s.a.x * M, 0, s.a.y * M));
    bounds.expandByPoint(new THREE.Vector3(s.b.x * M, s.wall.height * M, s.b.y * M));
  }
  for (const f of plan.furniture) bounds.expandByPoint(new THREE.Vector3(f.x * M, 0, f.y * M));

  return { group, walls, bounds, materials };
}

/** Frees the geometry and scene-owned materials of a built scene. */
export function disposePlanScene(scene: PlanScene): void {
  scene.group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  for (const m of scene.materials) m.dispose();
}

type Own = <T extends THREE.Material>(m: T) => T;

function buildFloor(room: Room, own: Own): THREE.Mesh {
  const shape = new THREE.Shape(room.polygon.map((p) => new THREE.Vector2(p.x * M, -p.y * M)));
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    own(new THREE.MeshStandardMaterial({ color: room.floorColor, roughness: 0.85, side: THREE.DoubleSide })),
  );
  mesh.name = `floor:${room.key}`;
  // The shape is drawn in (x, -y); rotating it flat maps that to world (X, Z = y).
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  mesh.receiveShadow = true;
  return mesh;
}

function buildWall(seg: WallSegment, openings: Opening[], rooms: Room[], factory: FurnitureMeshFactory, own: Own): SceneWall {
  const beside = roomsBesideWall(seg, rooms);
  const face = (side: WallSide) =>
    own(new THREE.MeshStandardMaterial({ color: wallFaceColor(seg, side, beside[side]) ?? EXTERIOR_WALL_COLOR, roughness: 0.92 }));
  const edge = own(new THREE.MeshStandardMaterial({ color: WALL_EDGE_COLOR, roughness: 0.92 }));
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z. Local +z is the wall's 2D normal (front) side.
  const faceMaterials = [edge, edge, edge, edge, face('front'), face('back')];

  const group = new THREE.Group();
  group.name = `wall:${seg.wall.id}`;
  const mid = add(seg.a, scale(seg.dir, seg.length / 2));
  group.position.set(mid.x * M, 0, mid.y * M);
  group.rotation.y = -Math.atan2(seg.dir.y, seg.dir.x);

  const t = seg.wall.thickness * M;
  const pieces = wallPieces({ length: seg.length, thickness: seg.wall.thickness, height: seg.wall.height }, openings);
  for (const b of pieces.solids) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry((b.x1 - b.x0) * M, (b.y1 - b.y0) * M, t), faceMaterials);
    mesh.position.set(((b.x0 + b.x1) / 2) * M, ((b.y0 + b.y1) / 2) * M, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const s of pieces.openings) {
    const fill =
      s.opening.kind === 'window'
        ? buildWindow(s.x0 * M, s.x1 * M, s.sill * M, s.top * M, t, own)
        : buildDoor(s.opening, s.x0 * M, s.x1 * M, s.top * M, t, factory, own);
    group.add(fill);
  }

  return {
    id: seg.wall.id,
    group,
    mid: new THREE.Vector2(mid.x * M, mid.y * M),
    normal: new THREE.Vector2(seg.normal.x, seg.normal.y),
  };
}

function buildWindow(x0: number, x1: number, sill: number, top: number, t: number, own: Own): THREE.Group {
  const g = new THREE.Group();
  g.name = 'window';
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const glass = own(new THREE.MeshPhysicalMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false }));
  const frame = own(new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.6 }));
  const pane = new THREE.Mesh(new THREE.BoxGeometry(w, top - sill, 0.01), glass);
  pane.position.set(cx, (sill + top) / 2, 0);
  const sillMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.025, t + 0.04), frame);
  sillMesh.position.set(cx, sill + 0.0125, 0);
  sillMesh.castShadow = true;
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.03, top - sill, 0.03), frame);
  mullion.position.set(cx, (sill + top) / 2, 0);
  g.add(pane, sillMesh, mullion);
  return g;
}

/** A door leaf hinged on its swing side and left ajar toward the side it opens to. */
function buildDoor(o: Opening, x0: number, x1: number, top: number, t: number, factory: FurnitureMeshFactory, own: Own): THREE.Group {
  const w = x1 - x0;
  const hingeLeft = o.swing !== 'right';
  const sgn = o.flip ? -1 : 1;
  const dirX = hingeLeft ? 1 : -1;
  const pivot = new THREE.Group();
  pivot.name = 'door';
  pivot.position.set(hingeLeft ? x0 : x1, 0, (sgn * t) / 2);
  pivot.rotation.y = -dirX * sgn * DOOR_OPEN_ANGLE;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, top - 0.01, 0.04), own(new THREE.MeshStandardMaterial({ color: DOOR_COLOR, roughness: 0.7 })));
  leaf.position.set((dirX * w) / 2, top / 2, sgn * 0.02);
  leaf.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), factory.material('#c9b27a', { metalness: 0.8, roughness: 0.3 }));
  knob.position.set(dirX * (w - 0.08), 1.0, sgn * 0.06);
  pivot.add(leaf, knob);
  return pivot;
}
