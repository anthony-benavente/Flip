/** Test-only: builds a minimal binary glTF (GLB) holding one box mesh. Used by unit and e2e tests. */

type Vec3 = [number, number, number];

/** A GLB with a single untextured box from `min` to `max` (meters, glTF is Y-up). */
export function boxGlb(min: Vec3 = [-0.5, 0, -0.5], max: Vec3 = [0.5, 1, 0.5]): ArrayBuffer {
  const positions = new Float32Array(
    [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]),
  );
  // Two triangles per face; corner index bits are x=1, y=2, z=4.
  const faces = [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ];
  const indices = new Uint16Array(faces.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]));

  const bin = new Uint8Array(pad4(positions.byteLength + indices.byteLength));
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);

  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'box' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.8, 1] } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  };
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonChunk = new Uint8Array(pad4(text.length)).fill(0x20);
  jsonChunk.set(text);

  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  new Uint8Array(out, 20, jsonChunk.length).set(jsonChunk);
  const binStart = 20 + jsonChunk.length;
  view.setUint32(binStart, bin.length, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // "BIN"
  new Uint8Array(out, binStart + 8, bin.length).set(bin);
  return out;
}

function pad4(n: number): number {
  return Math.ceil(n / 4) * 4;
}
