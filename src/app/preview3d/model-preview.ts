import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ModelOrientation } from '../model/custom-model';
import { disposeObject, parseModel } from './model-cache';
import { fitModelToBox } from './model-fit';

export { disposeObject, parseModel };

/**
 * Small 3D view for the model upload dialog: the model fitted into a template's box, drawn as a
 * wireframe, with an arrow out of the front. Loaded lazily, like the main preview.
 */
export class ModelPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  private readonly controls: OrbitControls;
  private readonly frameGroup = new THREE.Group();
  private readonly lineMaterial = new THREE.LineBasicMaterial({ color: '#2f6fde' });
  private source: THREE.Object3D | null = null;
  private fitted: THREE.Group | null = null;
  private frame = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#eef0f2');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(2, 4, 3);
    this.scene.add(sun, this.frameGroup);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', () => this.requestRender());
    this.resize();
  }

  /** Shows a parsed model, taking ownership of it. */
  setModel(source: THREE.Object3D): void {
    this.clearModel();
    this.source = source;
  }

  /** Fits the model into a `w` × `d` × `h` meter box and frames the camera on it. */
  fit(orientation: ModelOrientation, w: number, d: number, h: number): void {
    if (this.fitted) this.scene.remove(this.fitted);
    this.fitted = this.source ? fitModelToBox(this.source, orientation, w, d, h) : null;
    if (this.fitted) this.scene.add(this.fitted);

    this.clearFrame();
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), this.lineMaterial);
    edges.position.y = h / 2;
    const size = Math.max(w, d, h);
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.005, d / 2), size * 0.4, '#d9534f', size * 0.1, size * 0.06);
    const grid = new THREE.GridHelper(size * 3, 12, '#c4c8ce', '#dde0e4');
    this.frameGroup.add(edges, arrow, grid);

    this.camera.position.set(size * 1.1, h / 2 + size * 0.9, size * 1.8);
    this.controls.target.set(0, h / 2, 0);
    this.controls.update();
    this.requestRender();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.controls.dispose();
    this.clearModel();
    this.clearFrame();
    this.lineMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private clearModel(): void {
    if (this.fitted) this.scene.remove(this.fitted);
    this.fitted = null;
    if (this.source) disposeObject(this.source);
    this.source = null;
  }

  private clearFrame(): void {
    for (const child of [...this.frameGroup.children]) {
      this.frameGroup.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.LineSegments || o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          if (o.material !== this.lineMaterial) (o.material as THREE.Material).dispose();
        }
      });
    }
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.resize();
      this.renderer.render(this.scene, this.camera);
    });
  }
}
