/** User-uploaded pictures shown on art items (`FurnitureItem.artImageId`). */

export interface ArtImage {
  id: string;
  name: string;
  fileName: string;
  mimeType: ImageType;
  /** Pixel size, for keeping a frame's proportions. */
  width: number;
  height: number;
  byteSize: number;
  createdAt: string;
}

/** An image's metadata plus its file bytes. */
export interface ArtImageRecord {
  meta: ArtImage;
  data: ArrayBuffer;
}

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export const IMAGE_FILE_ACCEPT = 'image/png,image/jpeg,image/webp';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** A default image name from a file name: "sunset_beach.jpg" → "sunset beach". */
export function imageNameFromFile(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Picture';
}

/** Validates image metadata read from a file or storage. */
export function isArtImage(v: unknown): v is ArtImage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    ['id', 'name', 'fileName', 'createdAt'].every((k) => typeof m[k] === 'string') &&
    (m['mimeType'] === 'image/png' || m['mimeType'] === 'image/jpeg' || m['mimeType'] === 'image/webp') &&
    ['width', 'height', 'byteSize'].every((k) => typeof m[k] === 'number' && (m[k] as number) > 0)
  );
}

/**
 * Reads the type and pixel size from a PNG, JPEG or WebP file's header, or null for anything
 * else. Works without decoding the image, so it also runs outside the browser.
 */
export function readImageHeader(data: ArrayBuffer): { mimeType: ImageType; width: number; height: number } | null {
  const b = new Uint8Array(data);
  const view = new DataView(data);
  const ascii = (at: number, s: string) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
  const found = (mimeType: ImageType, width: number, height: number) => (width > 0 && height > 0 ? { mimeType, width, height } : null);

  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 'PNG') && ascii(12, 'IHDR')) {
    return found('image/png', view.getUint32(16), view.getUint32(20));
  }

  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      // Start-of-frame markers carry the size; C4 (Huffman), C8 and CC (arithmetic) do not.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return found('image/jpeg', view.getUint16(i + 7), view.getUint16(i + 5));
      }
      i += 2 + view.getUint16(i + 2);
    }
    return null;
  }

  if (b.length >= 30 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
    if (ascii(12, 'VP8 ')) return found('image/webp', view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if (ascii(12, 'VP8L')) {
      const width = 1 + (((b[22] & 0x3f) << 8) | b[21]);
      const height = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6));
      return found('image/webp', width, height);
    }
    if (ascii(12, 'VP8X')) {
      const u24 = (at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
      return found('image/webp', 1 + u24(24), 1 + u24(27));
    }
  }
  return null;
}
