import * as THREE from 'three';
import { ModelColors, ModelOrientation, ModelTrim } from '../model/custom-model';
import { applyMaterialColors, disposeObject, parseModel } from './model-cache';
import { fitModelToBox } from './model-fit';

export interface ModelPictureRequest {
  /** The .glb / .gltf file. */
  data: ArrayBuffer;
  orientation: ModelOrientation;
  trim?: ModelTrim;
  colors?: ModelColors;
  /** The template's box in centimeters, which the model is stretched to. */
  width: number;
  depth: number;
  height: number;
}

export interface ModelPictures {
  top: Blob;
  thumb: Blob;
}

/** Pixels along the longer side of the top view; enough to stay sharp when zoomed in on one item. */
export const TOP_VIEW_PX = 512;
export const THUMB_SIZE = { width: 192, height: 160 };

/**
 * Renders a model's pictures off screen with a throwaway renderer: a top view framed exactly on
 * its fitted box, so the plan can stretch it over the item's rectangle, and a three-quarter
 * thumbnail. Both are PNGs with transparent backgrounds. Loaded only by dynamic `import()`.
 */
export async function renderModelPictures(req: ModelPictureRequest): Promise<ModelPictures> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    const error = new Error('Model pictures need WebGL, which this browser could not start.');
    error.name = 'WebGLUnavailable';
    throw error;
  }
  const source = await parseModel(req.data).catch((e) => {
    renderer.dispose();
    throw e;
  });
  try {
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    applyMaterialColors(source, req.colors);
    const w = req.width / 100;
    const d = req.depth / 100;
    const h = req.height / 100;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(-1, 3, 2);
    scene.add(sun, fitModelToBox(source, req.orientation, w, d, h, req.trim));

    // Top: straight down, plan x to the right and the item's front (+z) at the bottom, like the plan.
    const long = Math.max(w, d);
    const topW = Math.max(8, Math.round((TOP_VIEW_PX * w) / long));
    const topH = Math.max(8, Math.round((TOP_VIEW_PX * d) / long));
    const top = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0.01, h * 2 + 20);
    top.position.set(0, h * 2 + 10, 0);
    top.up.set(0, 0, -1);
    top.lookAt(0, 0, 0);
    const topPng = await toPng(outlined(draw(renderer, scene, top, topW, topH)));

    // Thumbnail: from the front right, a little above, framing the whole box.
    const { width: tw, height: th } = THUMB_SIZE;
    const persp = new THREE.PerspectiveCamera(30, tw / th, 0.01, 100);
    const radius = Math.hypot(w, d, h) / 2;
    const vFov = (persp.fov * Math.PI) / 180;
    const fov = Math.min(vFov, 2 * Math.atan(Math.tan(vFov / 2) * persp.aspect));
    const distance = (radius / Math.sin(fov / 2)) * 0.95;
    persp.position.copy(new THREE.Vector3(0.6, 0.55, 1).normalize().multiplyScalar(distance)).add(new THREE.Vector3(0, h / 2, 0));
    persp.lookAt(0, h / 2, 0);
    const thumbPng = await toPng(draw(renderer, scene, persp, tw, th));

    return { top: topPng, thumb: thumbPng };
  } finally {
    disposeObject(source);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** Renders one view and copies it into a 2D canvas of its own. */
function draw(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): HTMLCanvasElement {
  renderer.setSize(width, height, false);
  camera.updateMatrixWorld(true);
  renderer.render(scene, camera);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(renderer.domElement, 0, 0, width, height);
  return canvas;
}

/** Adds a dark outline around the picture's opaque shape, so it reads as a plan drawing. */
function outlined(picture: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = picture;
  const shape = document.createElement('canvas');
  shape.width = width;
  shape.height = height;
  const s = shape.getContext('2d')!;
  s.drawImage(picture, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = 'rgba(45, 45, 45, 0.9)';
  s.fillRect(0, 0, width, height);

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  const o = Math.max(1, Math.round(Math.max(width, height) / 256));
  for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o], [o, o], [o, -o], [-o, o], [-o, -o]]) ctx.drawImage(shape, dx, dy);
  ctx.drawImage(picture, 0, 0);
  return out;
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be encoded.'))), 'image/png'));
}
