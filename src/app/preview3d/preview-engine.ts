import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Room, roomAt } from '../geometry/room-detection';
import { add, scale } from '../geometry/vec';
import { WallSegment } from '../geometry/wall-geometry';
import { catalogItem } from '../model/catalog';
import { Plan } from '../model/plan.model';
import { FurnitureMeshFactory } from './furniture-meshes';
import { wallPieces } from './wall-pieces';

/** cm → m */
const M = 0.01;
const EXTERIOR_WALL = '#e4dfd6';
const WALL_EDGE = '#cfc8bc';
const DOOR_COLOR = '#b48b5e';
const DOOR_OPEN_ANGLE = (70 * Math.PI) / 180;

export type CameraPreset = 'perspective' | 'top';

interface WallInfo {
  group: THREE.Group;
  mid: THREE.Vector2;
  normal: THREE.Vector2;
  cut: boolean;
}

/** Height a cut-away wall is reduced to, as a fraction of its full height. */
const CUTAWAY_SCALE = 0.12;

/** Owns the three.js scene for the 3D preview. Created lazily so three.js stays out of the main bundle. */
export class PreviewEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly ground: THREE.Mesh;
  private readonly factory = new FurnitureMeshFactory();
  private content = new THREE.Group();
  private ownedMaterials: THREE.Material[] = [];
  private walls: WallInfo[] = [];
  private center = new THREE.Vector3();
  private radius = 5;
  private size = new THREE.Vector3(4, 2.4, 4);
  private hasFitted = false;
  /** The camera follows presets and resizes until the user orbits it themselves. */
  private userMovedCamera = false;
  private preset: CameraPreset = 'perspective';
  private cutaway = true;
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#eef0f2');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 1.4));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshStandardMaterial({ color: '#dcd8d0', roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.002;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground, this.content);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 80;
    this.controls.addEventListener('change', () => this.requestRender());
    this.controls.addEventListener('start', () => (this.userMovedCamera = true));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  update(plan: Plan, rooms: Room[], segs: WallSegment[]): void {
    this.clearContent();
    const group = this.content;

    // Floors.
    for (const room of rooms) {
      const shape = new THREE.Shape(room.polygon.map((p) => new THREE.Vector2(p.x * M, -p.y * M)));
      const mat = this.own(new THREE.MeshStandardMaterial({ color: room.floorColor, roughness: 0.85, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.001;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Walls with door and window openings.
    const openingsByWall = new Map<string, Plan['openings']>();
    for (const o of plan.openings) {
      const list = openingsByWall.get(o.wallId) ?? [];
      list.push(o);
      openingsByWall.set(o.wallId, list);
    }
    for (const seg of segs) this.buildWall(seg, openingsByWall.get(seg.wall.id) ?? [], rooms);

    // Furniture.
    for (const f of plan.furniture) {
      const c = catalogItem(f.catalogId);
      const model = this.factory.build(c.shape, f.width * M, f.depth * M, f.height * M, f.color);
      model.position.set(f.x * M, 0, f.y * M);
      model.rotation.y = (-f.rotation * Math.PI) / 180;
      group.add(model);
    }

    this.updateBounds(plan, segs);
    if (!this.hasFitted && (segs.length || plan.furniture.length)) {
      this.hasFitted = true;
      this.setCamera('perspective');
    } else if (!this.userMovedCamera) {
      this.setCamera(this.preset, false);
    }
    this.requestRender();
  }

  setCamera(preset: CameraPreset, fromUser = true): void {
    if (fromUser) this.userMovedCamera = false;
    this.preset = preset;
    const c = this.center;
    // Distance that fits the plan's footprint in both the vertical and horizontal field of view.
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const fit = (extent: number) => extent / 2 / Math.tan(Math.min(vFov, hFov) / 2);
    if (preset === 'top') {
      // Far enough up that tall walls near the camera are not exaggerated by perspective.
      const d = fit(Math.max(this.size.x, this.size.z)) * 1.7 + this.size.y * 2;
      this.camera.position.set(c.x, c.y + d, c.z + 0.001);
    } else {
      const d = fit(Math.hypot(this.size.x, this.size.z)) * 0.85;
      const dir = new THREE.Vector3(0.62, 0.78, 0.9).normalize();
      this.camera.position.copy(c).addScaledVector(dir, d);
    }
    this.controls.target.copy(c);
    this.controls.update();
    this.requestRender();
  }

  setCutaway(on: boolean): void {
    this.cutaway = on;
    this.requestRender();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearContent();
    this.factory.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------------------

  private buildWall(seg: WallSegment, openings: Plan['openings'], rooms: Room[]): void {
    const t = seg.wall.thickness;
    const L = seg.length;
    const probe = (sign: number) => roomAt(rooms, add(add(seg.a, scale(seg.dir, L / 2)), scale(seg.normal, sign * (t / 2 + 5))));
    const front = probe(1);
    const back = probe(-1);
    const matFront = this.own(new THREE.MeshStandardMaterial({ color: front?.wallColor ?? EXTERIOR_WALL, roughness: 0.92 }));
    const matBack = this.own(new THREE.MeshStandardMaterial({ color: back?.wallColor ?? EXTERIOR_WALL, roughness: 0.92 }));
    const matEdge = this.own(new THREE.MeshStandardMaterial({ color: WALL_EDGE, roughness: 0.92 }));
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z. Local +z is the wall's 2D normal side.
    const faceMats = [matEdge, matEdge, matEdge, matEdge, matFront, matBack];

    const wallGroup = new THREE.Group();
    const mid = add(seg.a, scale(seg.dir, L / 2));
    wallGroup.position.set(mid.x * M, 0, mid.y * M);
    wallGroup.rotation.y = -Math.atan2(seg.dir.y, seg.dir.x);

    const tm = t * M;
    const piece = (x0: number, x1: number, y0: number, y1: number) => {
      if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, tm), faceMats);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wallGroup.add(mesh);
    };

    const pieces = wallPieces({ length: L, thickness: t, height: seg.wall.height }, openings);
    for (const b of pieces.solids) piece(b.x0 * M, b.x1 * M, b.y0 * M, b.y1 * M);
    for (const s of pieces.openings) this.buildOpeningFill(wallGroup, s.opening, s.x0 * M, s.x1 * M, s.sill * M, s.top * M, tm);

    this.content.add(wallGroup);
    this.walls.push({
      group: wallGroup,
      mid: new THREE.Vector2(mid.x * M, mid.y * M),
      normal: new THREE.Vector2(seg.normal.x, seg.normal.y),
      cut: false,
    });
  }

  private buildOpeningFill(wallGroup: THREE.Group, o: Plan['openings'][number], x0: number, x1: number, sill: number, top: number, tm: number): void {
    const w = x1 - x0;
    if (o.kind === 'window') {
      const glass = this.own(
        new THREE.MeshPhysicalMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false }),
      );
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w, top - sill, 0.01), glass);
      pane.position.set((x0 + x1) / 2, (sill + top) / 2, 0);
      wallGroup.add(pane);
      const frame = this.own(new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.6 }));
      const sillMesh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.025, tm + 0.04), frame);
      sillMesh.position.set((x0 + x1) / 2, sill + 0.0125, 0);
      sillMesh.castShadow = true;
      wallGroup.add(sillMesh);
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.03, top - sill, 0.03), frame);
      mullion.position.set((x0 + x1) / 2, (sill + top) / 2, 0);
      wallGroup.add(mullion);
      return;
    }
    // Door leaf, hinged on the swing side and left ajar toward the opening side.
    const leafMat = this.own(new THREE.MeshStandardMaterial({ color: DOOR_COLOR, roughness: 0.7 }));
    const hingeLeft = o.swing !== 'right';
    const sgn = o.flip ? -1 : 1;
    const hingeX = hingeLeft ? x0 : x1;
    const dirX = hingeLeft ? 1 : -1;
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, 0, (sgn * tm) / 2);
    pivot.rotation.y = -dirX * sgn * DOOR_OPEN_ANGLE;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, top - 0.01, 0.04), leafMat);
    leaf.position.set((dirX * w) / 2, top / 2, (sgn * 0.02));
    leaf.castShadow = true;
    pivot.add(leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), this.factory.material('#c9b27a', { metalness: 0.8, roughness: 0.3 }));
    knob.position.set(dirX * (w - 0.08), 1.0, sgn * 0.06);
    pivot.add(knob);
    wallGroup.add(pivot);
  }

  private updateBounds(plan: Plan, segs: WallSegment[]): void {
    const box = new THREE.Box3();
    for (const s of segs) {
      box.expandByPoint(new THREE.Vector3(s.a.x * M, 0, s.a.y * M));
      box.expandByPoint(new THREE.Vector3(s.b.x * M, s.wall.height * M, s.b.y * M));
    }
    for (const f of plan.furniture) {
      box.expandByPoint(new THREE.Vector3(f.x * M, 0, f.y * M));
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2.4, 2));
    box.getCenter(this.center);
    this.center.y = 0.6;
    const size = box.getSize(new THREE.Vector3());
    this.radius = Math.max(3, Math.hypot(size.x, size.z) * 0.6);
    this.size.set(Math.max(size.x, 2), Math.max(size.y, 1), Math.max(size.z, 2));
    this.ground.position.set(this.center.x, -0.002, this.center.z);

    const r = this.radius * 1.4;
    this.sun.position.set(this.center.x + r * 0.6, r * 1.6, this.center.z + r * 0.4);
    this.sun.target.position.copy(this.center);
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 0.1;
    cam.far = r * 5;
    cam.updateProjectionMatrix();
  }

  /** Cuts walls standing between the camera and the middle of the plan down to a low stub. */
  private updateCutaway(): void {
    const camDir = new THREE.Vector2(this.camera.position.x - this.center.x, this.camera.position.z - this.center.z);
    const horizontal = camDir.length();
    const steep = horizontal < 1e-3 || this.camera.position.y - this.center.y > horizontal * 2.5;
    camDir.normalize();
    for (const w of this.walls) {
      let cut = false;
      if (this.cutaway && !steep) {
        const toWall = new THREE.Vector2(w.mid.x - this.center.x, w.mid.y - this.center.z);
        const outward = w.normal.dot(toWall) >= 0 ? w.normal : w.normal.clone().negate();
        // Cut walls facing the camera, except those along the back of the plan.
        const backLimit = -0.15 * Math.max(this.size.x, this.size.z);
        cut = Math.abs(outward.dot(camDir)) > 0.35 && toWall.dot(camDir) > backLimit;
      }
      if (cut !== w.cut) {
        w.cut = cut;
        w.group.scale.y = cut ? CUTAWAY_SCALE : 1;
      }
    }
  }

  private requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.updateCutaway();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.hasFitted && !this.userMovedCamera) this.setCamera(this.preset, false);
    this.requestRender();
  }

  private own<T extends THREE.Material>(m: T): T {
    this.ownedMaterials.push(m);
    return m;
  }

  private clearContent(): void {
    this.content.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.scene.remove(this.content);
    this.content = new THREE.Group();
    this.scene.add(this.content);
    for (const m of this.ownedMaterials) m.dispose();
    this.ownedMaterials = [];
    this.walls = [];
  }
}
