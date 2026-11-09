import * as THREE from 'three';
import type { SnapshotRequest } from '../consult/snapshot';
import { itemElevation } from '../geometry/elevation';
import { catalogItem } from '../model/catalog';
import { CUTAWAY_SCALE, isWallCut } from './cutaway';
import { FurnitureMeshFactory } from './furniture-meshes';
import { ModelCache } from './model-cache';
import { buildPlanScene, disposePlanScene, M, ModelResolver, PlanScene } from './scene-builder';
import { TextureCache } from './texture-cache';

/**
 * Renders the plan once, off screen, and returns a JPEG data URL with labels drawn on it. It uses
 * its own throwaway renderer, so it works whatever the editor is showing, and it frees everything
 * before it returns. Loaded only by dynamic `import()`, like the rest of three.js.
 */
export async function snapshotPlan(req: SnapshotRequest): Promise<string> {
  const { plan, rooms, segments, view, width, height } = req;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  } catch {
    throw new Error('Screenshots need WebGL, which this browser could not start.');
  }
  const factory = new FurnitureMeshFactory();
  const models = new ModelCache();
  const textures = new TextureCache();
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: '#dcd8d0', roughness: 1 }));
  let content: PlanScene | null = null;
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    // Cast shadows only in the corner view: from above they hide the floor and furniture they fall on.
    const shadows = view === 'corner';
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    await models.load(
      plan.furniture.flatMap((f) => (f.modelId && req.models.model(f.modelId) ? [f.modelId] : [])),
      (id) => req.models.bytes(id),
    );
    await textures.load(
      plan.furniture.flatMap((f) => (f.artImageId && req.images.image(f.artImageId) ? [f.artImageId] : [])),
      req.images,
    );
    const resolve: ModelResolver = (id) => {
      const meta = req.models.model(id);
      if (!meta) return undefined;
      models.recolor(id, meta.colors);
      const object = models.get(id);
      return object ? { object, orientation: meta.orientation, trim: meta.trim } : undefined;
    };
    content = buildPlanScene(plan, rooms, segments, factory, resolve, (id) => (req.images.image(id) ? textures.get(id) : undefined));

    // The same look as the 3D preview: soft background, sky light and one shadow-casting sun.
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef0f2');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 1.4), content.group, ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.002;
    ground.receiveShadow = true;

    const box = content.bounds.clone();
    if (box.isEmpty()) box.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2.4, 2));
    const center = box.getCenter(new THREE.Vector3());
    center.y = 0.6;
    const size = box.getSize(new THREE.Vector3());
    const extent = { x: Math.max(size.x, 2), y: Math.max(size.y, 1), z: Math.max(size.z, 2) };
    ground.position.set(center.x, -0.002, center.z);

    const reach = Math.max(3, Math.hypot(size.x, size.z) * 0.6) * 1.4;
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(center.x + reach * 0.6, reach * 1.6, center.z + reach * 0.4);
    sun.target.position.copy(center);
    sun.castShadow = shadows;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.1, far: reach * 5 });
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun, sun.target);

    const aspect = width / height;
    let camera: THREE.Camera;
    if (view === 'top') {
      // Straight down with plan +x to the right and +y down the picture, like the 2D plan.
      const half = Math.max(extent.z / 2, extent.x / 2 / aspect) * 1.1;
      const top = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, extent.y + 50);
      top.position.set(center.x, extent.y + 20, center.z);
      top.up.set(0, 0, -1);
      top.lookAt(center.x, 0, center.z);
      camera = top;
    } else {
      const corner = new THREE.PerspectiveCamera(45, aspect, 0.05, 500);
      const vFov = (corner.fov * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
      const distance = (Math.hypot(extent.x, extent.z) / 2 / Math.tan(Math.min(vFov, hFov) / 2)) * 0.85;
      corner.position.copy(center).addScaledVector(new THREE.Vector3(0.62, 0.78, 0.9).normalize(), distance);
      corner.lookAt(center);
      camera = corner;
      // Lower the walls between the camera and the rooms, as the preview's cutaway does.
      const at = { x: center.x, y: center.z };
      const from = { x: corner.position.x, y: corner.position.z };
      for (const w of content.walls) {
        if (!isWallCut(w.mid, w.normal, at, from, corner.position.y - center.y, Math.max(extent.x, extent.z))) continue;
        w.group.scale.y = CUTAWAY_SCALE;
        for (const o of w.attached) o.visible = false;
      }
    }
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(renderer.domElement, 0, 0, width, height);
    drawLabels(ctx, camera, req, content, width, height);
    return out.toDataURL('image/jpeg', 0.85);
  } finally {
    if (content) disposePlanScene(content);
    ground.geometry.dispose();
    (ground.material as THREE.Material).dispose();
    factory.dispose();
    models.dispose();
    textures.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** Writes each room's name and each item's name plus the last four characters of its id, so the picture can be matched to `get_plan`. */
function drawLabels(ctx: CanvasRenderingContext2D, camera: THREE.Camera, req: SnapshotRequest, content: PlanScene, width: number, height: number): void {
  const at = (x: number, y: number, z: number) => {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return p.z < 1 && Math.abs(p.x) <= 1.05 && Math.abs(p.y) <= 1.05 ? { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height } : null;
  };
  // Labels that would land on an earlier one move up or down a line, so each stays readable.
  const taken: { left: number; right: number; top: number; bottom: number }[] = [];
  const write = (text: string, p: { x: number; y: number }, font: string, color: string) => {
    ctx.font = font;
    ctx.textAlign = 'center';
    const half = ctx.measureText(text).width / 2 + 3;
    const rect = (y: number) => ({ left: p.x - half, right: p.x + half, top: y - 14, bottom: y + 4 });
    const free = (r: ReturnType<typeof rect>) => !taken.some((t) => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top);
    const y = [0, 16, -16, 32, -32, 48, -48].map((d) => p.y + d).find((candidate) => free(rect(candidate))) ?? p.y;
    taken.push(rect(y));
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeText(text, p.x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, p.x, y);
  };

  for (const room of req.rooms) {
    const p = at(room.label.x * M, 0.02, room.label.y * M);
    if (p) write(room.name, { x: p.x, y: p.y - 14 }, '700 15px system-ui, sans-serif', '#0f4c81');
  }
  for (const f of req.plan.furniture) {
    if (content.group.getObjectByName(`furniture:${f.id}`)?.visible === false) continue;
    const p = at(f.x * M, (itemElevation(f, req.rooms) + f.height) * M, f.y * M);
    if (p) write(`${f.label ?? catalogItem(f.catalogId).name} ${f.id.slice(-4)}`, p, '600 12px system-ui, sans-serif', '#1f2937');
  }

  const note = req.view === 'top' ? 'Top view: plan x runs right, y runs down. Labels: name and last 4 characters of the id.' : 'Corner view. Labels: name and last 4 characters of the id.';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillRect(8, 8, ctx.measureText(note).width + 12, 22);
  ctx.fillStyle = '#374151';
  ctx.fillText(note, 14, 23);
}
