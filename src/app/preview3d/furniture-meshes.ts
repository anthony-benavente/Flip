import * as THREE from 'three';
import { FurnitureShape } from '../model/catalog';
import { cooktopBurners, cooktopKnobs, cooktopKnobStrip } from '../model/furniture-symbols';
import { FloorMaterial } from '../model/plan.model';
import { shade } from '../shared/color';
import { floorPattern } from './floor-textures';

export interface BuildOptions {
  /** Picture shown on art items (an uploaded image). */
  map?: THREE.Texture;
  /** Takes ownership of materials made just for this item (the scene disposes them). */
  own?: <T extends THREE.Material>(m: T) => T;
}

const BULB = '#ffe7b0';
const MIRROR = '#dfe6ea';
/** Picture area of framed art with no uploaded image. */
const PLACEHOLDER_ART = '#d8d0c4';

/**
 * Builds simple primitive models for furniture. Units are meters. The model is centered on x/z,
 * sits on y = 0, with its back at -z (matching the 2D plan's local -y).
 */
export class FurnitureMeshFactory {
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly floorTextures = new Map<FloorMaterial, THREE.DataTexture | null>();
  private readonly glass = new THREE.MeshPhysicalMaterial({
    color: 0xcfe6f2,
    transparent: true,
    opacity: 0.3,
    roughness: 0.05,
    metalness: 0,
    depthWrite: false,
  });

  material(color: string, opts: { roughness?: number; metalness?: number; emissive?: string } = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${opts.roughness ?? 0.8}|${opts.metalness ?? 0}|${opts.emissive ?? ''}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.8,
        metalness: opts.metalness ?? 0,
        ...(opts.emissive ? { emissive: new THREE.Color(opts.emissive), emissiveIntensity: 0.6 } : {}),
      });
      this.materials.set(key, m);
    }
    return m;
  }

  /** A flat picture facing +z: the uploaded image when there is one, otherwise a plain color. */
  private picture(g: THREE.Group, w: number, h: number, cy: number, z: number, opts: BuildOptions, fallback: string): void {
    const material = opts.map
      ? (opts.own ?? ((m) => m))(new THREE.MeshStandardMaterial({ map: opts.map, roughness: 0.7 }))
      : this.material(fallback, { roughness: 0.9 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(w, 0.001), Math.max(h, 0.001)), material);
    m.position.set(0, cy, z);
    g.add(m);
  }

  private mirrorGlass(): THREE.MeshStandardMaterial {
    return this.material(MIRROR, { roughness: 0.05, metalness: 0.9 });
  }

  /**
   * Shared, tiling grayscale texture for a floor material, or null for a plain floor. Floor UVs are
   * in meters, so the repeat makes one copy of the pattern cover its real size.
   */
  floorTexture(material: FloorMaterial): THREE.Texture | null {
    if (!this.floorTextures.has(material)) {
      const pattern = floorPattern(material);
      let texture: THREE.DataTexture | null = null;
      if (pattern) {
        texture = new THREE.DataTexture(pattern.data, pattern.size, pattern.size, THREE.RGBAFormat);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1 / pattern.meters, 1 / pattern.meters);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
      }
      this.floorTextures.set(material, texture);
    }
    return this.floorTextures.get(material)!;
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    for (const t of this.floorTextures.values()) t?.dispose();
    this.floorTextures.clear();
    this.glass.dispose();
  }

  build(shape: FurnitureShape, w: number, d: number, h: number, color: string, opts: BuildOptions = {}): THREE.Group {
    const g = new THREE.Group();
    const c = color;
    const dark = shade(color, -0.25);
    const light = shade(color, 0.25);
    const wood = '#7a5a3e';
    const metal = '#8f9399';

    const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: string, mat?: THREE.Material) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(x1 - x0, 0.001), Math.max(y1 - y0, 0.001), Math.max(z1 - z0, 0.001)),
        mat ?? this.material(col),
      );
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      g.add(m);
      return m;
    };
    const cyl = (cx: number, cz: number, rTop: number, rBottom: number, y0: number, y1: number, col: string, mat?: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, Math.max(y1 - y0, 0.001), 28), mat ?? this.material(col));
      m.position.set(cx, (y0 + y1) / 2, cz);
      g.add(m);
      return m;
    };
    const sphere = (x: number, y: number, z: number, r: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    const legs = (inset: number, y1: number, r: number, col: string) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(sx * (w / 2 - inset), sz * (d / 2 - inset), r, r, 0, y1, col);
    };

    const X0 = -w / 2;
    const X1 = w / 2;
    const Z0 = -d / 2;
    const Z1 = d / 2;

    switch (shape) {
      case 'sofa':
      case 'armchair': {
        const seatH = h * 0.5;
        const back = Math.min(d * 0.25, 0.25);
        const arm = shape === 'armchair' ? Math.min(w * 0.18, 0.2) : Math.min(w * 0.1, 0.2);
        box(X0, X1, 0.08, seatH * 0.75, Z0, Z1, dark);
        box(X0 + arm, X1 - arm, seatH * 0.75, seatH, Z0 + back, Z1 - 0.02, light);
        box(X0, X1, 0.08, h, Z0, Z0 + back, c);
        box(X0, X0 + arm, 0.08, h * 0.7, Z0, Z1, c);
        box(X1 - arm, X1, 0.08, h * 0.7, Z0, Z1, c);
        legs(0.06, 0.08, 0.02, wood);
        break;
      }
      case 'sectional': {
        const seatH = h * 0.5;
        const back = Math.min(Math.min(w, d) * 0.2, 0.25);
        const seat = Math.min(w, d) * 0.45;
        // Recessed plinth so the sofa sits on the floor.
        box(X0 + 0.04, X1 - 0.04, 0, 0.06, Z0 + 0.04, Z0 + back + seat - 0.04, '#3a3530');
        box(X0 + 0.04, X0 + back + seat - 0.04, 0, 0.06, Z0 + 0.04, Z1 - 0.04, '#3a3530');
        box(X0, X1, 0.06, seatH, Z0, Z0 + back + seat, dark);
        box(X0, X0 + back + seat, 0.06, seatH, Z0, Z1, dark);
        box(X0 + back, X1, seatH * 0.95, seatH + 0.02, Z0 + back, Z0 + back + seat, light);
        box(X0 + back, X0 + back + seat, seatH * 0.95, seatH + 0.02, Z0 + back, Z1, light);
        box(X0, X1, 0.06, h, Z0, Z0 + back, c);
        box(X0, X0 + back, 0.06, h, Z0, Z1, c);
        break;
      }
      case 'chair': {
        const seatH = Math.min(0.46, h * 0.5);
        box(X0, X1, seatH - 0.04, seatH, Z0, Z1, c);
        box(X0, X1, seatH, h, Z0, Z0 + 0.04, c);
        legs(0.03, seatH - 0.04, 0.015, dark);
        break;
      }
      case 'stool':
        cyl(0, 0, w / 2, w / 2, h - 0.05, h, c);
        cyl(0, 0, 0.025, 0.025, 0.02, h - 0.05, metal);
        cyl(0, 0, w * 0.35, w * 0.4, 0, 0.02, metal);
        break;
      case 'ottoman':
        box(X0, X1, 0.04, h, Z0, Z1, c);
        legs(0.04, 0.04, 0.015, wood);
        break;
      case 'table':
      case 'coffee-table':
      case 'desk': {
        const top = shape === 'coffee-table' ? 0.04 : 0.035;
        box(X0, X1, h - top, h, Z0, Z1, c);
        legs(0.05, h - top, shape === 'coffee-table' ? 0.025 : 0.025, dark);
        if (shape === 'desk') box(X1 - Math.min(0.45, w * 0.35), X1 - 0.02, h * 0.45, h - top, Z0 + 0.03, Z1 - 0.03, dark);
        break;
      }
      case 'round-table':
        cyl(0, 0, w / 2, w / 2, h - 0.035, h, c);
        cyl(0, 0, 0.05, 0.05, 0.03, h - 0.035, dark);
        cyl(0, 0, w * 0.25, w * 0.28, 0, 0.03, dark);
        break;
      case 'bed': {
        const frameH = h * 0.45;
        box(X0, X1, 0.05, frameH, Z0, Z1, wood);
        box(X0 + 0.02, X1 - 0.02, frameH, h, Z0 + 0.04, Z1 - 0.02, '#f5f3ef');
        box(X0 + 0.01, X1 - 0.01, h - 0.05, h + 0.015, Z0 + d * 0.35, Z1 - 0.01, c);
        box(X0 - 0.02, X1 + 0.02, 0, Math.max(h * 2.3, 1), Z0 - 0.06, Z0, wood);
        const pillows = w > 1.2 ? 2 : 1;
        const pw = (w - 0.1 * (pillows + 1)) / pillows;
        for (let i = 0; i < pillows; i++) {
          const x = X0 + 0.1 + i * (pw + 0.1);
          box(x, x + pw, h, h + 0.12, Z0 + 0.08, Z0 + 0.08 + 0.4, '#ffffff');
        }
        legs(0.05, 0.05, 0.025, wood);
        break;
      }
      case 'nightstand':
      case 'dresser': {
        box(X0, X1, 0.06, h, Z0, Z1, c);
        const rows = shape === 'dresser' ? 3 : 2;
        for (let i = 1; i < rows; i++) {
          const y = 0.06 + ((h - 0.06) * i) / rows;
          box(X0 + 0.02, X1 - 0.02, y - 0.004, y + 0.004, Z1, Z1 + 0.004, dark);
        }
        legs(0.04, 0.06, 0.015, dark);
        break;
      }
      case 'wardrobe':
        box(X0, X1, 0, h, Z0, Z1, c);
        box(-0.004, 0.004, 0.05, h - 0.05, Z1, Z1 + 0.004, dark);
        cyl(-0.04, Z1 + 0.015, 0.008, 0.008, h * 0.45, h * 0.6, metal);
        cyl(0.04, Z1 + 0.015, 0.008, 0.008, h * 0.45, h * 0.6, metal);
        break;
      case 'bookshelf': {
        const t = 0.02;
        box(X0, X1, 0, h, Z0, Z0 + t, dark);
        box(X0, X0 + t, 0, h, Z0, Z1, c);
        box(X1 - t, X1, 0, h, Z0, Z1, c);
        const shelves = Math.max(3, Math.round(h / 0.35));
        for (let i = 0; i <= shelves; i++) {
          const y = Math.min(h - t, (h * i) / shelves);
          box(X0 + t, X1 - t, y, y + t, Z0, Z1, c);
          if (i < shelves) {
            // A row of "books" on each shelf.
            const top = (h * (i + 1)) / shelves - 0.06;
            box(X0 + t + 0.02, X0 + w * 0.55, y + t, Math.max(y + t + 0.05, top), Z0 + 0.03, Z1 - 0.03, i % 2 ? '#8a4b3c' : '#3f5a7a');
          }
        }
        break;
      }
      case 'tv-stand':
        box(X0, X1, 0.08, h, Z0, Z1, c);
        legs(0.05, 0.08, 0.015, metal);
        break;
      case 'tv':
        box(X0, X1, h * 0.12, h, -0.03, 0.03, '#141414', this.material('#141414', { roughness: 0.3, metalness: 0.3 }));
        box(-w * 0.15, w * 0.15, 0, 0.015, Z0, Z1, '#222');
        box(-0.03, 0.03, 0.015, h * 0.12, -0.02, 0.02, '#222');
        break;
      case 'counter':
        box(X0 + 0.02, X1 - 0.02, 0.1, h - 0.04, Z0, Z1 - 0.03, '#f0eee9');
        box(X0 + 0.04, X1 - 0.04, 0, 0.1, Z0, Z1 - 0.08, '#4a4744');
        box(X0, X1, h - 0.04, h, Z0, Z1, c, this.material(c, { roughness: 0.4 }));
        break;
      case 'fridge':
        box(X0, X1, 0, h, Z0, Z1, c, this.material(c, { roughness: 0.35, metalness: 0.4 }));
        box(X0 + 0.01, X1 - 0.01, h * 0.62, h * 0.625, Z1, Z1 + 0.003, '#555');
        box(X1 - 0.08, X1 - 0.06, h * 0.3, h * 0.55, Z1, Z1 + 0.04, metal);
        box(X1 - 0.08, X1 - 0.06, h * 0.68, h * 0.9, Z1, Z1 + 0.04, metal);
        break;
      case 'stove': {
        box(X0, X1, 0, h - 0.01, Z0, Z1, c, this.material(c, { roughness: 0.4, metalness: 0.3 }));
        box(X0, X1, h - 0.01, h, Z0, Z1, '#1d1d1d', this.material('#1d1d1d', { roughness: 0.2 }));
        const r = Math.min(w, d) * 0.13;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl((sx * w) / 4, (sz * d) / 4, r, r, h, h + 0.006, '#3a3a3a');
        box(X0 + 0.05, X1 - 0.05, h * 0.25, h * 0.75, Z1, Z1 + 0.005, '#2b2b2b');
        break;
      }
      case 'sink':
        box(X0, X1, 0.08, h - 0.03, Z0, Z1, dark);
        box(X0, X1, h - 0.03, h, Z0, Z1, c, this.material(c, { roughness: 0.3 }));
        box(-w * 0.3, w * 0.3, h - 0.025, h + 0.002, Z0 + d * 0.25, Z0 + d * 0.8, '#d5d9dc', this.material('#d5d9dc', { roughness: 0.2, metalness: 0.2 }));
        cyl(0, Z0 + 0.06, 0.012, 0.012, h, h + 0.2, metal, this.material(metal, { roughness: 0.2, metalness: 0.8 }));
        break;
      case 'cooktop': {
        // Gas cooktop: stainless deck, five burners under three cast-iron grates, knobs in a notch at the front.
        const deck = Math.min(h, 0.008);
        const iron = this.material('#1c1c1e', { roughness: 0.6 });
        const chrome = this.material(metal, { roughness: 0.2, metalness: 0.8 });
        box(X0, X1, 0, deck, Z0, Z1, c, this.material(c, { roughness: 0.3, metalness: 0.6 }));
        for (const b of cooktopBurners(w, d)) {
          cyl(b.x, b.y, b.r, b.r, deck, deck + 0.006, '#8f9399', chrome);
          cyl(b.x, b.y, b.r * 0.7, b.r * 0.75, deck + 0.006, deck + 0.016, '#1c1c1e', iron);
        }
        for (const k of cooktopKnobs(w, d)) cyl(k.x, k.y, 0.016, 0.018, deck, deck + 0.022, metal, chrome);
        // Grates: a frame per section with bars running front to back; the middle one stops short of the knobs.
        const bar = 0.012;
        const knobStrip = cooktopKnobStrip(d);
        for (let s = 0; s < 3; s++) {
          const gx0 = X0 + (w * s) / 3 + 0.01;
          const gx1 = X0 + (w * (s + 1)) / 3 - 0.01;
          const gz1 = s === 1 ? Z1 - knobStrip : Z1 - 0.01;
          const gz0 = Z0 + 0.01;
          box(gx0, gx1, deck, h, gz0, gz0 + bar, '#1c1c1e', iron);
          box(gx0, gx1, deck, h, gz1 - bar, gz1, '#1c1c1e', iron);
          const bars = Math.max(2, Math.round((gx1 - gx0) / 0.07));
          for (let i = 0; i <= bars; i++) {
            const x = gx0 + ((gx1 - gx0 - bar) * i) / bars;
            box(x, x + bar, deck, h, gz0, gz1, '#1c1c1e', iron);
          }
        }
        break;
      }
      case 'oven-tower': {
        // Tall cabinet: drawers below, a stainless wall oven with a microwave above it, doors on top.
        const steel = this.material('#b9bcc2', { roughness: 0.3, metalness: 0.5 });
        const chrome = this.material(metal, { roughness: 0.2, metalness: 0.8 });
        const glass = this.material('#141414', { roughness: 0.15 });
        const aw = Math.min(w - 0.08, 0.76);
        const ovenBottom = h * 0.29;
        const split = h * 0.6;
        const comboTop = h * 0.81;
        box(X0 + 0.02, X1 - 0.02, 0, 0.1, Z0, Z1 - 0.06, '#3a3530');
        box(X0, X1, 0.1, h, Z0, Z1, c);
        const seam = (y: number) => box(X0 + 0.02, X1 - 0.02, y - 0.004, y + 0.004, Z1, Z1 + 0.004, dark);
        seam(0.1 + (ovenBottom - 0.1) / 2);
        seam(ovenBottom - 0.02);
        seam(comboTop + 0.02);
        box(-0.004, 0.004, comboTop + 0.04, h - 0.02, Z1, Z1 + 0.004, dark);
        // Oven
        box(-aw / 2, aw / 2, ovenBottom, split, Z1 - 0.02, Z1 + 0.01, '#b9bcc2', steel);
        box(-aw / 2 + 0.06, aw / 2 - 0.06, ovenBottom + 0.06, split - 0.12, Z1 + 0.01, Z1 + 0.012, '#141414', glass);
        box(-aw / 2 + 0.05, aw / 2 - 0.05, split - 0.08, split - 0.06, Z1 + 0.03, Z1 + 0.05, metal, chrome);
        // Microwave
        box(-aw / 2, aw / 2, split + 0.005, comboTop, Z1 - 0.02, Z1 + 0.01, '#b9bcc2', steel);
        box(-aw / 2 + 0.06, aw / 2 - 0.06, split + 0.05, comboTop - 0.13, Z1 + 0.01, Z1 + 0.012, '#141414', glass);
        box(-aw / 2 + 0.05, aw / 2 - 0.05, comboTop - 0.11, comboTop - 0.09, Z1 + 0.03, Z1 + 0.05, metal, chrome);
        box(-aw / 2 + 0.03, aw / 2 - 0.03, comboTop - 0.07, comboTop - 0.02, Z1 + 0.01, Z1 + 0.012, '#141414', glass);
        break;
      }
      case 'kitchen-sink': {
        // Drop-in sink: a thin rim on the counter top with a dark basin opening, faucet at the back.
        const chrome = this.material(metal, { roughness: 0.2, metalness: 0.8 });
        box(X0, X1, 0, 0.004, Z0, Z1, c, this.material(c, { roughness: 0.25, metalness: 0.6 }));
        box(X0 + w * 0.08, X1 - w * 0.08, 0.004, 0.005, Z0 + d * 0.3, Z1 - d * 0.1, dark);
        cyl(0, Z0 + d * 0.15, 0.014, 0.018, 0.004, h, metal, chrome);
        box(-0.01, 0.01, h - 0.02, h, Z0 + d * 0.15, Z0 + d * 0.15 + Math.min(d * 0.4, 0.22), metal, chrome);
        break;
      }
      case 'toilet': {
        const porcelain = this.material(c, { roughness: 0.25 });
        box(X0 + 0.02, X1 - 0.02, h * 0.45, h * 1.05, Z0, Z0 + d * 0.28, c, porcelain);
        cyl(0, Z0 + d * 0.62, Math.min(w * 0.45, d * 0.36), Math.min(w * 0.3, d * 0.25), 0, h * 0.55, c, porcelain);
        cyl(0, Z0 + d * 0.62, Math.min(w * 0.46, d * 0.37), Math.min(w * 0.46, d * 0.37), h * 0.55, h * 0.58, '#ffffff');
        break;
      }
      case 'bathtub': {
        const porcelain = this.material(c, { roughness: 0.25 });
        const t = 0.07;
        box(X0, X1, 0, 0.06, Z0, Z1, c, porcelain);
        box(X0, X1, 0, h, Z0, Z0 + t, c, porcelain);
        box(X0, X1, 0, h, Z1 - t, Z1, c, porcelain);
        box(X0, X0 + t, 0, h, Z0, Z1, c, porcelain);
        box(X1 - t, X1, 0, h, Z0, Z1, c, porcelain);
        box(X0 + t, X1 - t, 0.06, h * 0.55, Z0 + t, Z1 - t, '#bfe0ee', this.glass);
        break;
      }
      case 'shower':
        box(X0, X1, 0, 0.06, Z0, Z1, c, this.material(c, { roughness: 0.3 }));
        box(X0, X1, 0.06, h, Z1 - 0.01, Z1, '', this.glass);
        box(X1 - 0.01, X1, 0.06, h, Z0, Z1, '', this.glass);
        cyl(0, Z0 + 0.05, 0.08, 0.08, h - 0.15, h - 0.13, metal, this.material(metal, { metalness: 0.8, roughness: 0.2 }));
        break;
      case 'rug':
        box(X0, X1, 0, 0.012, Z0, Z1, c);
        box(X0 + 0.08, X1 - 0.08, 0.012, 0.014, Z0 + 0.08, Z1 - 0.08, light);
        break;
      case 'plant': {
        const r = Math.min(w, d) / 2;
        cyl(0, 0, r * 0.6, r * 0.45, 0, h * 0.3, '#a0634a');
        const leaf = this.material(c, { roughness: 0.9 });
        const blobs: [number, number, number, number][] = [
          [0, h * 0.62, 0, r],
          [r * 0.3, h * 0.8, r * 0.2, r * 0.65],
          [-r * 0.3, h * 0.75, -r * 0.25, r * 0.65],
          [0, h - r * 0.55, 0, r * 0.55],
        ];
        for (const [x, y, z, s] of blobs) {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leaf);
          m.position.set(x, y, z);
          g.add(m);
        }
        break;
      }
      case 'lamp': {
        const r = Math.min(w, d) / 2;
        cyl(0, 0, r * 0.6, r * 0.7, 0, 0.03, '#333');
        cyl(0, 0, 0.012, 0.012, 0.03, h - 0.3, '#333');
        cyl(0, 0, r * 0.75, r, h - 0.32, h, c, this.material(c, { emissive: BULB }));
        break;
      }
      case 'table-lamp': {
        const r = Math.min(w, d) / 2;
        cyl(0, 0, r * 0.45, r * 0.5, 0, h * 0.06, dark);
        cyl(0, 0, r * 0.25, r * 0.4, h * 0.06, h * 0.45, c, this.material(c, { roughness: 0.4 }));
        cyl(0, 0, 0.008, 0.008, h * 0.45, h * 0.6, '#333');
        cyl(0, 0, r * 0.7, r, h * 0.55, h, '#f3ead8', this.material('#f3ead8', { emissive: BULB }));
        break;
      }
      case 'vase': {
        const r = Math.min(w, d) / 2;
        const glaze = this.material(c, { roughness: 0.3 });
        cyl(0, 0, r, r * 0.65, 0, h * 0.7, c, glaze);
        cyl(0, 0, r * 0.45, r, h * 0.7, h * 0.85, c, glaze);
        cyl(0, 0, r * 0.5, r * 0.45, h * 0.85, h, c, glaze);
        break;
      }
      case 'books':
        box(X0, X1 - 0.01, 0, h / 3, Z0, Z1, c);
        box(X0 + 0.01, X1, h / 3, (2 * h) / 3, Z0, Z1 - 0.01, '#3f5a7a');
        box(X0 + 0.005, X1 - 0.005, (2 * h) / 3, h, Z0 + 0.005, Z1, '#d9b44a');
        break;
      case 'art': {
        const frame = Math.min(0.04, Math.min(w, h) * 0.06);
        const mat = Math.min(w, h) * 0.12;
        box(X0, X1, 0, h, Z0, Z1 - 0.004, c, this.material(c, { roughness: 0.5 }));
        box(X0 + frame, X1 - frame, frame, h - frame, Z1 - 0.004, Z1 - 0.002, '#f6f4ef');
        this.picture(g, w - 2 * (frame + mat), h - 2 * (frame + mat), h / 2, Z1 - 0.001, opts, PLACEHOLDER_ART);
        break;
      }
      case 'canvas-art':
        box(X0, X1, 0, h, Z0, Z1, c, this.material(c, { roughness: 0.9 }));
        if (opts.map) this.picture(g, w, h, h / 2, Z1 + 0.001, opts, c);
        break;
      case 'mirror': {
        const frame = Math.min(0.05, Math.min(w, h) * 0.07);
        box(X0, X1, 0, h, Z0, Z1 - 0.004, c, this.material(c, { roughness: 0.4, metalness: 0.5 }));
        box(X0 + frame, X1 - frame, frame, h - frame, Z1 - 0.004, Z1, MIRROR, this.mirrorGlass());
        break;
      }
      case 'round-mirror': {
        const r = Math.min(w, h) / 2;
        const disc = (radius: number, z0: number, z1: number, m: THREE.Material) => {
          const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, z1 - z0, 48), m);
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(0, h / 2, (z0 + z1) / 2);
          g.add(mesh);
        };
        disc(r, Z0, Z1 - 0.004, this.material(c, { roughness: 0.4, metalness: 0.5 }));
        disc(r * 0.88, Z1 - 0.004, Z1, this.mirrorGlass());
        break;
      }
      case 'shelf':
        box(X0, X1, 0, h, Z0, Z1, c);
        break;
      case 'tv-wall':
        box(X0, X1, 0, h, Z0, Z1 - 0.004, '#141414', this.material('#141414', { roughness: 0.3, metalness: 0.3 }));
        box(X0 + 0.01, X1 - 0.01, 0.01, h - 0.01, Z1 - 0.004, Z1, '#0b0c0e', this.material('#0b0c0e', { roughness: 0.1, metalness: 0.2 }));
        break;
      case 'sconce': {
        const brass = this.material('#b8955a', { roughness: 0.35, metalness: 0.7 });
        const r = Math.min(w, d * 0.8) / 2;
        box(-w * 0.2, w * 0.2, 0, h * 0.7, Z0, Z0 + 0.01, '', brass);
        box(-0.008, 0.008, h * 0.4, h * 0.45, Z0 + 0.01, Z0 + d * 0.6, '', brass);
        cyl(0, Z0 + d * 0.6, r * 0.8, r, h * 0.35, h, c, this.material(c, { emissive: BULB }));
        break;
      }
      case 'pendant': {
        // Ceiling items: y = 0 is the bottom of the fixture, y = h touches the ceiling.
        const r = Math.min(w, d) / 2;
        const shadeH = Math.min(h * 0.4, r * 1.2);
        cyl(0, 0, r * 0.3, r, 0, shadeH, c, this.material(c, { roughness: 0.5, metalness: 0.3 }));
        sphere(0, shadeH * 0.25, 0, r * 0.25, this.material('#fff8e6', { emissive: BULB }));
        cyl(0, 0, 0.004, 0.004, shadeH, h - 0.02, '#222');
        cyl(0, 0, 0.05, 0.05, h - 0.02, h, '#222');
        break;
      }
      case 'chandelier': {
        const brass = this.material(c, { roughness: 0.35, metalness: 0.7 });
        const ring = Math.min(w, d) / 2 - 0.03;
        const armY = h * 0.25;
        cyl(0, 0, 0.03, 0.01, 0, armY + 0.04, c, brass);
        cyl(0, 0, 0.006, 0.006, armY + 0.04, h - 0.02, c, brass);
        cyl(0, 0, 0.05, 0.05, h - 0.02, h, c, brass);
        const bulb = this.material('#fff8e6', { emissive: BULB });
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          const x = Math.cos(a) * ring;
          const z = Math.sin(a) * ring;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(ring, 0.012, 0.012), brass);
          arm.position.set(x / 2, armY, z / 2);
          arm.rotation.y = -a;
          g.add(arm);
          cyl(x, z, 0.012, 0.012, armY, armY + 0.08, c, brass);
          sphere(x, armY + 0.11, z, 0.025, bulb);
        }
        break;
      }
      case 'ceiling-fan': {
        const r = Math.min(w, d) / 2;
        const bladeY = h * 0.3;
        cyl(0, 0, 0.09, 0.07, 0, h * 0.2, '#f3ead8', this.material('#f3ead8', { emissive: BULB }));
        cyl(0, 0, 0.1, 0.11, h * 0.2, h * 0.45, dark);
        cyl(0, 0, 0.012, 0.012, h * 0.45, h - 0.02, dark);
        cyl(0, 0, 0.05, 0.05, h - 0.02, h, dark);
        const blade = this.material(c, { roughness: 0.6 });
        const length = r - 0.1;
        for (let i = 0; i < 5; i++) {
          const a = (i * 2 * Math.PI) / 5;
          const m = new THREE.Mesh(new THREE.BoxGeometry(length, 0.01, 0.13), blade);
          m.position.set(Math.cos(a) * (0.1 + length / 2), bladeY, Math.sin(a) * (0.1 + length / 2));
          m.rotation.y = -a;
          g.add(m);
        }
        break;
      }
      case 'box':
      default:
        box(X0, X1, 0, h, Z0, Z1, c);
    }

    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = o.material !== this.glass;
        o.receiveShadow = true;
      }
    });
    return g;
  }
}
