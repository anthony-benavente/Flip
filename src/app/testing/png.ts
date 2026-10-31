/** Test-only: builds small valid PNG files (uncompressed deflate). Used by unit and e2e tests. */

type Rgb = [number, number, number];

/** A width×height PNG split into two colored halves, left and right. */
export function twoTonePng(width = 4, height = 3, left: Rgb = [200, 80, 60], right: Rgb = [40, 90, 160]): ArrayBuffer {
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter: none
    for (let x = 0; x < width; x++) raw.push(...(x < width / 2 ? left : right));
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  const bytes = concat([
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStored(Uint8Array.from(raw))),
    chunk('IEND', new Uint8Array()),
  ]);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A zlib stream of stored (uncompressed) deflate blocks. */
function zlibStored(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.of(0x78, 0x01)];
  for (let i = 0; i < data.length || i === 0; i += 0xffff) {
    const block = data.subarray(i, i + 0xffff);
    const last = i + 0xffff >= data.length ? 1 : 0;
    const len = block.length;
    parts.push(Uint8Array.of(last, len & 0xff, len >> 8, ~len & 0xff, (~len >> 8) & 0xff), block);
  }
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const adler = new Uint8Array(4);
  new DataView(adler.buffer).setUint32(0, ((b << 16) | a) >>> 0);
  parts.push(adler);
  return concat(parts);
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
