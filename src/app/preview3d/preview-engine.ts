import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Room } from '../geometry/room-detection';
import { Obstacle, walkMove, walkObstacles, WALK_EYE_HEIGHT } from '../geometry/walk';
import { WallSegment } from '../geometry/wall-geometry';
import { CustomModel } from '../model/custom-model';
import { Plan, Point } from '../model/plan.model';
import { CUTAWAY_SCALE, isWallCut } from './cutaway';
import { FurnitureMeshFactory } from './furniture-meshes';
import { ModelCache } from './model-cache';
import { ImageSource, TextureCache } from './texture-cache';
import { isTypingTarget } from '../shared/dom';
import { buildPlanScene, disposePlanScene, ModelResolver, PlanScene, SceneWall } from './scene-builder';
import { addOutline, findTagged, pickFromHits } from './scene-picking';
import type { SelectionItem } from '../state/editor.store';

export type CameraPreset = 'perspective' | 'top';

/** Called on a click in the view with the element under it (`null` for empty space). */
export type PickHandler = (item: SelectionItem | null, additive: boolean) => void;

/** A press that moves farther than this is an orbit or pan, not a click. */
const CLICK_SLOP_PX = 4;
const SELECTION_COLOR = '#2f6fde';
/** Walk mode: speeds in cm/s, turn rates, and the field of view while inside a room. */
const WALK_SPEED = 130;
const RUN_SPEED = 260;
const KEY_TURN_RATE = 1.8;
const LOOK_RATE = 0.004;
const WALK_FOV = 70;
const MAX_PITCH = (80 * Math.PI) / 180;
/** A long frame (a hidden tab, a hitch) must not let a step skip through a wall. */
const MAX_FRAME_S = 0.05;

/** Where the engine finds uploaded models: metadata (orientation, and whether it still exists) and file bytes. */
export interface ModelSource {
  model(id: string): CustomModel | undefined;
  bytes(id: string): Promise<ArrayBuffer | null>;
}

const NO_MODELS: ModelSource = { model: () => undefined, bytes: async () => null };
const NO_IMAGES: ImageSource = { image: () => undefined, bytes: async () => null };

/**
 * Renders the 3D preview: renderer, lights, camera presets, orbit controls and the wall cutaway.
 * The plan's objects come from `buildPlanScene`. Loaded lazily so three.js stays out of the main bundle.
 */
export class PreviewEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
  private readonly controls: OrbitControls;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly ground: THREE.Mesh;
  private readonly factory = new FurnitureMeshFactory();
  private readonly models = new ModelCache();
  private readonly textures = new TextureCache();
  private content: PlanScene | null = null;
  private lastUpdate: Parameters<PreviewEngine['update']> | null = null;
  private disposed = false;
  private walls: (SceneWall & { cut: boolean })[] = [];
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
  private readonly raycaster = new THREE.Raycaster();
  private readonly outlineMaterial = new THREE.LineBasicMaterial({ color: SELECTION_COLOR, depthTest: false, transparent: true });
  private outlines: THREE.LineSegments[] = [];
  private selection: SelectionItem[] = [];
  private pressedAt: { x: number; y: number } | null = null;
  onPick: PickHandler | null = null;
  /** Called when walk mode ends on its own (Esc). */
  onWalkEnd: (() => void) | null = null;
  private walking = false;
  /** Walk position in plan centimeters and view direction in radians (yaw 0 faces plan +x). */
  private walkAt: Point = { x: 0, y: 0 };
  private yaw = 0;
  private pitch = 0;
  private obstacles: Obstacle[] = [];
  private readonly held = new Set<string>();
  private walkFrame = 0;
  private lastTick = 0;
  private looking = false;

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
    this.scene.add(this.ground);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 80;
    this.controls.addEventListener('change', () => this.requestRender());
    this.controls.addEventListener('start', () => (this.userMovedCamera = true));
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /**
   * Rebuilds the plan's objects. Uploaded models and art images that are not loaded yet draw as
   * built-in models and plain pictures at first; once they load, the scene is rebuilt with them.
   */
  update(plan: Plan, rooms: Room[], segs: WallSegment[], source: ModelSource = NO_MODELS, images: ImageSource = NO_IMAGES): void {
    this.lastUpdate = [plan, rooms, segs, source, images];
    this.obstacles = walkObstacles(segs, plan.openings);
    const resolve: ModelResolver = (id) => {
      const meta = source.model(id);
      const object = meta && this.models.get(id);
      return object ? { object, orientation: meta.orientation, trim: meta.trim } : undefined;
    };
    this.clearContent();
    const picture = (id: string) => (images.image(id) ? this.textures.get(id) : undefined);
    this.content = buildPlanScene(plan, rooms, segs, this.factory, resolve, picture);
    this.scene.add(this.content.group);
    this.walls = this.content.walls.map((w) => ({ ...w, cut: false }));
    this.showSelection();

    this.updateBounds(this.content.bounds);
    if (!this.hasFitted && !this.content.bounds.isEmpty()) {
      this.hasFitted = true;
      if (!this.walking) this.setCamera('perspective');
    } else if (!this.userMovedCamera && !this.walking) {
      this.setCamera(this.preset, false);
    }
    this.requestRender();

    const rebuild = (loaded: boolean) => {
      if (loaded && !this.disposed && this.lastUpdate) this.update(...this.lastUpdate);
    };
    const missing = plan.furniture.flatMap((f) => (f.modelId && source.model(f.modelId) && !this.models.has(f.modelId) ? [f.modelId] : []));
    if (missing.length) this.models.load(missing, (id) => source.bytes(id)).then(rebuild);
    const missingImages = plan.furniture.flatMap((f) =>
      f.artImageId && images.image(f.artImageId) && !this.textures.has(f.artImageId) ? [f.artImageId] : [],
    );
    if (missingImages.length) this.textures.load(missingImages, images).then(rebuild);
  }

  setCamera(preset: CameraPreset, fromUser = true): void {
    if (this.walking) this.stopWalk();
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

  /** Puts the camera at eye height at `at` (plan cm) and lets the arrow keys, WASD and the mouse move it. */
  startWalk(at: Point): void {
    if (this.walking) return;
    this.walking = true;
    this.walkAt = { ...at };
    this.yaw = 0;
    this.pitch = 0;
    this.controls.enabled = false;
    this.camera.fov = WALK_FOV;
    this.camera.near = 0.05;
    this.camera.rotation.order = 'YXZ';
    this.camera.updateProjectionMatrix();
    this.renderer.domElement.style.cursor = 'grab';
    window.addEventListener('keydown', this.onWalkKeyDown, true);
    window.addEventListener('keyup', this.onWalkKeyUp, true);
    window.addEventListener('blur', this.onWalkBlur);
    this.renderer.domElement.addEventListener('pointermove', this.onLook);
    this.lastTick = performance.now();
    this.walkFrame = requestAnimationFrame(this.tick);
    this.placeCamera();
  }

  /** Back to the orbit camera in the current preset. */
  stopWalk(): void {
    if (!this.walking) return;
    this.walking = false;
    this.looking = false;
    cancelAnimationFrame(this.walkFrame);
    this.walkFrame = 0;
    this.held.clear();
    window.removeEventListener('keydown', this.onWalkKeyDown, true);
    window.removeEventListener('keyup', this.onWalkKeyUp, true);
    window.removeEventListener('blur', this.onWalkBlur);
    this.renderer.domElement.removeEventListener('pointermove', this.onLook);
    this.renderer.domElement.style.cursor = '';
    this.controls.enabled = true;
    this.camera.fov = 45;
    this.camera.rotation.order = 'XYZ';
    this.camera.updateProjectionMatrix();
    this.setCamera(this.preset, false);
  }

  setCutaway(on: boolean): void {
    this.cutaway = on;
    this.requestRender();
  }

  /** Outlines the selected elements. */
  setSelection(items: SelectionItem[]): void {
    this.selection = items;
    this.showSelection();
    this.requestRender();
  }

  dispose(): void {
    this.disposed = true;
    this.lastUpdate = null;
    this.onPick = null;
    this.stopWalk();
    this.onWalkEnd = null;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    this.clearContent();
    this.outlineMaterial.dispose();
    this.factory.dispose();
    this.models.dispose();
    this.textures.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private updateBounds(bounds: THREE.Box3): void {
    const box = bounds.clone();
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
    const center = { x: this.center.x, y: this.center.z };
    const camera = { x: this.camera.position.x, y: this.camera.position.z };
    const height = this.camera.position.y - this.center.y;
    const extent = Math.max(this.size.x, this.size.z);
    for (const w of this.walls) {
      const cut = this.cutaway && !this.walking && isWallCut(w.mid, w.normal, center, camera, height, extent);
      if (cut !== w.cut) {
        w.cut = cut;
        w.group.scale.y = cut ? CUTAWAY_SCALE : 1;
        for (const o of w.attached) o.visible = !cut;
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
    if (this.hasFitted && !this.userMovedCamera && !this.walking) this.setCamera(this.preset, false);
    this.requestRender();
  }

  private placeCamera(): void {
    this.camera.position.set(this.walkAt.x * 0.01, WALK_EYE_HEIGHT * 0.01, this.walkAt.y * 0.01);
    // The camera looks down -Z; this turns it to face (cos yaw, sin yaw) on the plan.
    this.camera.rotation.set(this.pitch, -this.yaw - Math.PI / 2, 0);
  }

  private readonly tick = (now: number): void => {
    if (!this.walking) return;
    const dt = Math.min((now - this.lastTick) / 1000, MAX_FRAME_S);
    this.lastTick = now;
    const down = (...keys: string[]) => keys.some((k) => this.held.has(k));
    this.yaw += ((down('arrowright') ? 1 : 0) - (down('arrowleft') ? 1 : 0)) * KEY_TURN_RATE * dt;
    const ahead = (down('w', 'arrowup') ? 1 : 0) - (down('s', 'arrowdown') ? 1 : 0);
    const side = (down('d') ? 1 : 0) - (down('a') ? 1 : 0);
    if (ahead || side) {
      const speed = (this.held.has('shift') ? RUN_SPEED : WALK_SPEED) * dt;
      const norm = Math.hypot(ahead, side);
      const fx = Math.cos(this.yaw);
      const fy = Math.sin(this.yaw);
      const delta = {
        x: ((fx * ahead - fy * side) / norm) * speed,
        y: ((fy * ahead + fx * side) / norm) * speed,
      };
      this.walkAt = walkMove(this.walkAt, delta, this.obstacles);
    }
    this.placeCamera();
    this.updateCutaway();
    this.renderer.render(this.scene, this.camera);
    this.walkFrame = requestAnimationFrame(this.tick);
  };

  private readonly onWalkKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') {
      e.preventDefault();
      e.stopPropagation();
      this.onWalkEnd?.();
    } else if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      // Keep the editor's own W, D and arrow-key shortcuts from firing while walking.
      e.preventDefault();
      e.stopPropagation();
      this.held.add(key);
    }
    this.syncShift(e);
  };

  private readonly onWalkKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.key.toLowerCase());
    this.syncShift(e);
  };

  private syncShift(e: KeyboardEvent): void {
    if (e.shiftKey) this.held.add('shift');
    else this.held.delete('shift');
  }

  private readonly onWalkBlur = (): void => this.held.clear();

  private readonly onLook = (e: PointerEvent): void => {
    if (!this.looking) return;
    this.yaw += e.movementX * LOOK_RATE;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - e.movementY * LOOK_RATE));
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.walking) {
      this.looking = e.button === 0;
      if (this.looking) this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    this.pressedAt = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.walking) {
      this.looking = false;
      return;
    }
    const from = this.pressedAt;
    this.pressedAt = null;
    if (!from || e.button !== 0 || Math.hypot(e.clientX - from.x, e.clientY - from.y) > CLICK_SLOP_PX) return;
    this.onPick?.(this.pick(e.clientX, e.clientY), e.shiftKey || e.ctrlKey || e.metaKey);
  };

  /** The element under a screen point. */
  private pick(clientX: number, clientY: number): SelectionItem | null {
    if (!this.content) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    // Match the cutaway to the current camera, as the next frame would.
    this.updateCutaway();
    this.raycaster.setFromCamera(ndc, this.camera);
    return pickFromHits(this.raycaster.intersectObject(this.content.group, true));
  }

  private showSelection(): void {
    this.clearOutlines();
    if (!this.content) return;
    for (const o of findTagged(this.content.group, this.selection)) {
      const line = addOutline(o, this.outlineMaterial);
      if (line) this.outlines.push(line);
    }
  }

  private clearOutlines(): void {
    for (const line of this.outlines) {
      line.removeFromParent();
      line.geometry.dispose();
    }
    this.outlines = [];
  }

  private clearContent(): void {
    this.clearOutlines();
    if (!this.content) return;
    this.scene.remove(this.content.group);
    disposePlanScene(this.content);
    this.content = null;
    this.walls = [];
  }
}
