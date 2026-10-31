import { twoTonePng } from '../testing/png';
import { imageNameFromFile, isArtImage, readImageHeader } from './art-image';

function bytes(values: number[], length = values.length): ArrayBuffer {
  const b = new Uint8Array(Math.max(length, values.length));
  b.set(values);
  return b.buffer;
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('art images', () => {
  it('reads PNG size', () => {
    expect(readImageHeader(twoTonePng(40, 30))).toEqual({ mimeType: 'image/png', width: 40, height: 30 });
  });

  it('reads JPEG size from the frame header, skipping other segments', () => {
    const jpeg = bytes([
      0xff, 0xd8,
      // APP0 segment, 6 bytes long including its length field
      0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46,
      // SOF0: length, precision, height 480, width 640
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03,
    ], 40);
    expect(readImageHeader(jpeg)).toEqual({ mimeType: 'image/jpeg', width: 640, height: 480 });
  });

  it('reads WebP size from lossy, lossless and extended headers', () => {
    const riff = (kind: string, rest: number[]) => bytes([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(kind), ...rest], 40);
    // VP8: chunk size, 3-byte frame tag and start code, then 14-bit width and height.
    expect(readImageHeader(riff('VP8 ', [0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 0x2c, 0x01, 0xc8, 0x00]))).toEqual({
      mimeType: 'image/webp',
      width: 300,
      height: 200,
    });
    // VP8L: signature 0x2f, then width-1 and height-1 packed in 14 bits each (299 and 199 here).
    const w = 299;
    const h = 199;
    const packed = [w & 0xff, ((w >> 8) & 0x3f) | ((h & 0x03) << 6), (h >> 2) & 0xff, (h >> 10) & 0x0f];
    expect(readImageHeader(riff('VP8L', [0, 0, 0, 0, 0x2f, ...packed]))).toEqual({ mimeType: 'image/webp', width: 300, height: 200 });
    // VP8X: flags and reserved bytes, then 24-bit width-1 and height-1.
    expect(readImageHeader(riff('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0x2b, 0x01, 0x00, 0xc7, 0x00, 0x00]))).toEqual({
      mimeType: 'image/webp',
      width: 300,
      height: 200,
    });
  });

  it('rejects other files', () => {
    expect(readImageHeader(bytes(ascii('GIF89a'), 40))).toBeNull();
    expect(readImageHeader(new ArrayBuffer(0))).toBeNull();
  });

  it('names images after their file', () => {
    expect(imageNameFromFile('sunset_beach.jpg')).toBe('sunset beach');
    expect(imageNameFromFile('.png')).toBe('Picture');
  });

  it('validates stored metadata', () => {
    const meta = { id: 'i_1', name: 'A', fileName: 'a.png', mimeType: 'image/png', width: 4, height: 3, byteSize: 90, createdAt: '2026-01-01' };
    expect(isArtImage(meta)).toBe(true);
    expect(isArtImage({ ...meta, mimeType: 'image/gif' })).toBe(false);
    expect(isArtImage({ ...meta, width: 0 })).toBe(false);
    expect(isArtImage(null)).toBe(false);
  });
});
