import { base64ToBytes, bytesToBase64, sameBytes } from './base64';

describe('base64', () => {
  it('round-trips binary data larger than one chunk', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    const back = base64ToBytes(bytesToBase64(bytes.buffer));
    expect(sameBytes(back, bytes.buffer)).toBe(true);
  });

  it('compares buffers by content', () => {
    expect(sameBytes(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2]).buffer)).toBe(true);
    expect(sameBytes(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 3]).buffer)).toBe(false);
    expect(sameBytes(new Uint8Array([1]).buffer, new Uint8Array([1, 2]).buffer)).toBe(false);
  });

  it('throws on malformed text', () => {
    expect(() => base64ToBytes('not base64!')).toThrow();
  });
});
