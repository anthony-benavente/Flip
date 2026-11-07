/**
 * Builds the three.js object graph for a plan: floors, walls with door and window openings, and
 * furniture. No renderer, camera or DOM is involved, so this runs (and is tested) in Node.
 * Coordinates: plan (x, y) in cm maps to world (X, Z) in meters, with Y up.
 */
import * as THREE from 'three';
import { itemElevation, mountedWall } from '../geometry/elevation';
import { Room, roomsBesideWall, wallFaceColor } from '../geometry/room-detection';
import { add, scale } from '../geometry/vec';
import { endExtensions, faceTrimGaps, subtractGaps, WallSegment } from '../geometry/wall-geometry';
import { catalogItem } from '../model/catalog';
import { ModelOrientation, ModelTrim } from '../model/custom-model';
import { DEFAULT_DOOR_COLOR, EXTERIOR_WALL_COLOR } from '../model/palettes';
import { FloorMaterial, Opening, Plan, WallSide } from '../model/plan.model';
import { FurnitureMeshFactory } from './furniture-meshes';
import { fitModelToBox, SHARED_MODEL } from './model-fit';
import { ITEM_BOX, ItemBox, tagPick } from './scene-picking';
import { BASEBOARD, CASING, CROWN, railingParts, WallPieces, wallPieces } from '../geometry/wall-pieces';

/** cm → m */
export const M = 0.01;
export const WALL_EDGE_COLOR = '#cfc8bc';
export const DOOR_OPEN_ANGLE = (70 * Math.PI) / 180;
const RAIL_WOOD = '#6b4a32';
const RAIL_WHITE = '#f4f3ef';

export interface SceneWall {
  id: string;
  group: THREE.Group;
  /** Midpoint and unit normal on the ground plane (world X, Z). */
  mid: THREE.Vector2;
  normal: THREE.Vector2;
  /** Items hung on this wall, hidden with it when the cutaway lowers it. */
  attached: THREE.Object3D[];
}

export interface PlanScene {
  group: THREE.Group;
  walls: SceneWall[];
  /** Box around walls (full height) and furniture positions; empty for an empty plan. */
  bounds: THREE.Box3;
  /** Materials created for this scene only; shared furniture materials stay with the factory. */
  materials: THREE.Material[];
}

/** A loaded art image for a picture id, or `undefined` while it loads or when it is gone. */
export type ImageResolver = (imageId: string) => THREE.Texture | undefined;

/** A loaded uploaded model and how to turn it, or `undefined` to use the built-in model. */
export type ModelResolver = (modelId: string) => { object: THREE.Object3D; orientation: ModelOrientation; trim?: ModelTrim } | undefined;

export function buildPlanScene(
  plan: Plan,
  rooms: Room[],
  segments: WallSegment[],
  factory: FurnitureMeshFactory,
  models: ModelResolver = () => undefined,
  images: ImageResolver = () => undefined,
): PlanScene {
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const own = <T extends THREE.Material>(m: T): T => (materials.push(m), m);

  for (const room of rooms) group.add(buildFloor(room, factory, own), buildCeiling(room, own));

  const openingsByWall = new Map<string, Opening[]>();
  for (const o of plan.openings) openingsByWall.set(o.wallId, [...(openingsByWall.get(o.wallId) ?? []), o]);
  const walls = segments.map((seg) => {
    const wall = buildWall(seg, openingsByWall.get(seg.wall.id) ?? [], rooms, segments, factory, own);
    group.add(wall.group);
    return wall;
  });

  const wallById = new Map(walls.map((w) => [w.id, w]));
  const bounds = new THREE.Box3();
  for (const f of plan.furniture) {
    const elevation = itemElevation(f, rooms);
    const custom = f.modelId ? models(f.modelId) : undefined;
    const model = custom
      ? fitModelToBox(custom.object, custom.orientation, f.width * M, f.depth * M, f.height * M, custom.trim)
      : factory.build(catalogItem(f.catalogId).shape, f.width * M, f.depth * M, f.height * M, f.color, {
          map: f.artImageId ? images(f.artImageId) : undefined,
          own,
        });
    model.name = `furniture:${f.id}`;
    tagPick(model, { kind: 'furniture', id: f.id });
    model.userData[ITEM_BOX] = { w: f.width * M, d: f.depth * M, h: f.height * M } satisfies ItemBox;
    model.position.set(f.x * M, elevation * M, f.y * M);
    model.rotation.y = (-f.rotation * Math.PI) / 180;
    group.add(model);
    const mount = mountedWall(f, segments);
    if (mount) wallById.get(mount.seg.wall.id)?.attached.push(model);
    bounds.expandByPoint(new THREE.Vector3(f.x * M, elevation * M, f.y * M));
    bounds.expandByPoint(new THREE.Vector3(f.x * M, (elevation + f.height) * M, f.y * M));
  }

  for (const s of segments) {
    bounds.expandByPoint(new THREE.Vector3(s.a.x * M, 0, s.a.y * M));
    bounds.expandByPoint(new THREE.Vector3(s.b.x * M, s.wall.height * M, s.b.y * M));
  }

  return { group, walls, bounds, materials };
}

/** Frees the geometry and scene-owned materials of a built scene. Uploaded models stay with their cache. */
export function disposePlanScene(scene: PlanScene): void {
  scene.group.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData[SHARED_MODEL]) o.geometry.dispose();
  });
  for (const m of scene.materials) m.dispose();
}

type Own = <T extends THREE.Material>(m: T) => T;

/** How shiny each floor material is. */
const FLOOR_ROUGHNESS: Record<FloorMaterial, number> = { solid: 0.85, wood: 0.6, tile: 0.35, carpet: 1, concrete: 0.8 };

function buildFloor(room: Room, factory: FurnitureMeshFactory, own: Own): THREE.Mesh {
  const shape = new THREE.Shape(room.polygon.map((p) => new THREE.Vector2(p.x * M, -p.y * M)));
  const material = own(
    new THREE.MeshStandardMaterial({
      color: room.floorColor,
      map: factory.floorTexture(room.floorMaterial),
      roughness: FLOOR_ROUGHNESS[room.floorMaterial] ?? FLOOR_ROUGHNESS.solid,
      side: THREE.DoubleSide,
    }),
  );
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.name = `floor:${room.key}`;
  // The shape is drawn in (x, -y); rotating it flat maps that to world (X, Z = y).
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  mesh.receiveShadow = true;
  return mesh;
}

/** A ceiling facing down: hidden from the overhead and corner cameras, seen from below. */
function buildCeiling(room: Room, own: Own): THREE.Mesh {
  const shape = new THREE.Shape(room.polygon.map((p) => new THREE.Vector2(p.x * M, p.y * M)));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), own(new THREE.MeshStandardMaterial({ color: room.ceilingColor, roughness: 0.95 })));
  mesh.name = `ceiling:${room.key}`;
  // Rotating +90° about X maps the shape's (x, y) to world (X, Z = y) with its face pointing down.
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = room.ceilingHeight * M - 0.001;
  return mesh;
}

function buildWall(seg: WallSegment, openings: Opening[], rooms: Room[], segments: WallSegment[], factory: FurnitureMeshFactory, own: Own): SceneWall {
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

  if (seg.wall.type) {
    // A hidden wall only divides rooms, so it builds nothing.
    if (seg.wall.type === 'railing') group.add(buildRailing(seg.length, own));
    return { id: seg.wall.id, group, mid: new THREE.Vector2(mid.x * M, mid.y * M), normal: new THREE.Vector2(seg.normal.x, seg.normal.y), attached: [] };
  }

  const t = seg.wall.thickness * M;
  const pieces = wallPieces({ length: seg.length, thickness: seg.wall.thickness, height: seg.wall.height }, openings, endExtensions(seg, segments));
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
    group.add(tagPick(fill, { kind: 'opening', id: s.opening.id }));
  }
  group.add(buildTrim(seg, pieces, beside, segments, own));

  return {
    id: seg.wall.id,
    group,
    mid: new THREE.Vector2(mid.x * M, mid.y * M),
    normal: new THREE.Vector2(seg.normal.x, seg.normal.y),
    attached: [],
  };
}

/**
 * Baseboards, crown molding and door and window casings on each face of a wall that borders a
 * room, in that room's trim color. Built in the wall's local frame (centimeters → meters).
 */
function buildTrim(seg: WallSegment, pieces: WallPieces, beside: Record<WallSide, Room | null>, segments: WallSegment[], own: Own): THREE.Group {
  const trim = new THREE.Group();
  trim.name = 'trim';
  const t = seg.wall.thickness;
  const height = seg.wall.height;
  for (const side of ['front', 'back'] as const) {
    const room = beside[side];
    if (!room) continue;
    const material = own(new THREE.MeshStandardMaterial({ color: room.trimColor, roughness: 0.5 }));
    const sign = side === 'front' ? 1 : -1;
    const gaps = faceTrimGaps(seg, side, segments);
    /** A strip on this face: x and y ranges in cm, standing `depth` cm off the wall. */
    const strip = (x0: number, x1: number, y0: number, y1: number, depth: number, clip = false) => {
      if (clip) {
        for (const [a, b] of subtractGaps(x0, x1, gaps)) strip(a, b, y0, y1, depth);
        return;
      }
      if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry((x1 - x0) * M, (y1 - y0) * M, depth * M), material);
      mesh.position.set(((x0 + x1) / 2) * M, ((y0 + y1) / 2) * M, sign * (t / 2 + depth / 2) * M);
      mesh.castShadow = true;
      trim.add(mesh);
    };
    for (const b of pieces.solids) {
      if (b.y0 < 0.01) strip(b.x0, b.x1, 0, Math.min(BASEBOARD.height, b.y1), BASEBOARD.depth, true);
      if (room.crownMolding && b.y1 > height - 0.01) strip(b.x0, b.x1, height - CROWN.height, height, CROWN.depth, true);
    }
    for (const o of pieces.openings) {
      const w = CASING.width;
      const bottom = o.opening.kind === 'door' ? 0 : o.sill;
      const top = Math.min(o.top + w, height);
      strip(o.x0 - w, o.x0, bottom, top, CASING.depth);
      strip(o.x1, o.x1 + w, bottom, top, CASING.depth);
      strip(o.x0 - w, o.x1 + w, o.top, top, CASING.depth);
    }
  }
  return trim;
}

/** An open railing in the wall's local frame: stained posts and handrail, white balusters. */
function buildRailing(length: number, own: Own): THREE.Group {
  const g = new THREE.Group();
  g.name = 'railing';
  const wood = own(new THREE.MeshStandardMaterial({ color: RAIL_WOOD, roughness: 0.5 }));
  const white = own(new THREE.MeshStandardMaterial({ color: RAIL_WHITE, roughness: 0.6 }));
  for (const p of railingParts(length)) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry((p.x1 - p.x0) * M, (p.y1 - p.y0) * M, p.depth * M), p.kind === 'post' || p.kind === 'handrail' ? wood : white);
    mesh.position.set(((p.x0 + p.x1) / 2) * M, ((p.y0 + p.y1) / 2) * M, 0);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
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
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, top - 0.01, 0.04), own(new THREE.MeshStandardMaterial({ color: o.color ?? DEFAULT_DOOR_COLOR, roughness: 0.7 })));
  leaf.position.set((dirX * w) / 2, top / 2, sgn * 0.02);
  leaf.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), factory.material('#c9b27a', { metalness: 0.8, roughness: 0.3 }));
  knob.position.set(dirX * (w - 0.08), 1.0, sgn * 0.06);
  pivot.add(leaf, knob);
  return pivot;
}
