import * as THREE from 'three';
import { CATALOG } from '../model/catalog';
import { FurnitureMeshFactory } from './furniture-meshes';

/** Shapes with parts that intentionally extend past the nominal size (headboard, pillows, faucet, burners). */
const TALLER_THAN_NOMINAL = new Set(['bed', 'sink', 'stove', 'toilet']);
const TOL = 0.03; // meters

describe('FurnitureMeshFactory', () => {
  const factory = new FurnitureMeshFactory();
  afterAll(() => factory.dispose());

  it.each(CATALOG.map((c) => [c.id, c] as const))('builds %s to its catalog size', (_id, c) => {
    const w = c.width / 100;
    const d = c.depth / 100;
    const h = c.height / 100;
    const group = factory.build(c.shape, w, d, h, c.color);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());

    expect(group.children.length).toBeGreaterThan(0);
    // Sits on the floor and fits its footprint.
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(box.min.y).toBeLessThan(0.1);
    expect(size.x).toBeLessThanOrEqual(w + 0.05);
    expect(size.z).toBeLessThanOrEqual(d + 0.07);
    expect(size.x).toBeGreaterThan(w * 0.6);
    // Height matches, except for parts that deliberately stand above it.
    if (TALLER_THAN_NOMINAL.has(c.shape)) {
      expect(size.y).toBeGreaterThanOrEqual(h - TOL);
    } else {
      expect(size.y).toBeCloseTo(h, 1);
      expect(Math.abs(size.y - h)).toBeLessThan(TOL);
    }
  });

  it('centers models on x and z', () => {
    for (const c of CATALOG) {
      const box = new THREE.Box3().setFromObject(factory.build(c.shape, c.width / 100, c.depth / 100, c.height / 100, c.color));
      const center = box.getCenter(new THREE.Vector3());
      expect(Math.abs(center.x), c.id).toBeLessThan(0.1);
      expect(Math.abs(center.z), c.id).toBeLessThan(0.1);
    }
  });

  it('reuses materials for the same color', () => {
    expect(factory.material('#123456')).toBe(factory.material('#123456'));
    expect(factory.material('#123456')).not.toBe(factory.material('#654321'));
  });

  it('shows an uploaded picture on art and hands its material to the owner', () => {
    const map = new THREE.Texture();
    const owned: THREE.Material[] = [];
    const g = factory.build('art', 0.6, 0.04, 0.75, '#2b2b2b', { map, own: (m) => (owned.push(m), m) });
    const pictures: THREE.Mesh[] = [];
    g.traverse((o) => o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).map === map && pictures.push(o));
    expect(pictures).toHaveLength(1);
    expect(owned).toEqual([pictures[0].material]);
    map.dispose();
  });

  it('casts shadows from solid parts', () => {
    const g = factory.build('sofa', 2, 0.9, 0.85, '#7a8ca3');
    const meshes: THREE.Mesh[] = [];
    g.traverse((o) => o instanceof THREE.Mesh && meshes.push(o));
    expect(meshes.every((m) => m.castShadow && m.receiveShadow)).toBe(true);
  });
});
