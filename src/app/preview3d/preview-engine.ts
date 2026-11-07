import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Room } from '../geometry/room-detection';
import { WallSegment } from '../geometry/wall-geometry';
import { CustomModel } from '../model/custom-model';
import { Plan } from '../model/plan.model';
import { CUTAWAY_SCALE, isWallCut } from './cutaway';
import { FurnitureMeshFactory } from './furniture-meshes';
import { ModelCache } from './model-cache';
import { ImageSource, TextureCache } from './texture-cache';
import { buildPlanScene, disposePlanScene, ModelResolver, PlanScene, SceneWall } from './scene-builder';
import { addOutline, findTagged, pickFromHits } from './scene-picking';
import type { SelectionItem } from '../state/editor.store';

export type CameraPreset = 'perspective' | 'top';

/** Called on a click in the view with the element under it (`null` for empty space). */
export type PickHandler = (item: SelectionItem | null, additive: boolean) => void;

/** A press that moves farther than this is an orbit or pan, not a click. */
const CLICK_SLOP_PX = 4;
const SELECTION_COLOR = '#2f6fde';

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
      this.setCamera('perspective');
    } else if (!this.userMovedCamera) {
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
      const cut = this.cutaway && isWallCut(w.mid, w.normal, center, camera, height, extent);
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
    if (this.hasFitted && !this.userMovedCamera) this.setCamera(this.preset, false);
    this.requestRender();
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.pressedAt = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
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
