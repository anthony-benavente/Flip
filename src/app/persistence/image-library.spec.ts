import { TestBed } from '@angular/core/testing';
import { MAX_IMAGE_BYTES } from '../model/art-image';
import { twoTonePng } from '../testing/png';
import { ImageLibrary } from './image-library';
import { IMAGE_REPOSITORY } from './image-repository';
import { MemoryImageRepository } from './memory-image.repository';

describe('ImageLibrary', () => {
  let repo: MemoryImageRepository;
  let library: ImageLibrary;
  const png = (name = 'sunset_beach.png', w = 40, h = 30) => new File([twoTonePng(w, h)], name, { type: 'image/png' });
  const settle = () => new Promise((r) => setTimeout(r));

  beforeEach(async () => {
    repo = new MemoryImageRepository();
    TestBed.configureTestingModule({ providers: [{ provide: IMAGE_REPOSITORY, useValue: repo }] });
    library = TestBed.inject(ImageLibrary);
    await library.ready;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uploads an image with its type and pixel size', async () => {
    const image = await library.upload(png());
    expect(image).toMatchObject({ name: 'sunset beach', fileName: 'sunset_beach.png', mimeType: 'image/png', width: 40, height: 30 });
    expect(image.id).toMatch(/^i_/);
    expect(library.images()).toEqual([image]);
    expect(library.image(image.id)).toEqual(image);
    expect(new Uint8Array((await library.bytes(image.id))!)).toEqual(new Uint8Array(twoTonePng(40, 30)));
  });

  it('rejects files that are not images or are too large', async () => {
    await expect(library.upload(new File(['hello'], 'notes.png'))).rejects.toThrow('not a PNG, JPEG or WebP image');
    const big = png();
    Object.defineProperty(big, 'size', { value: MAX_IMAGE_BYTES + 1 });
    await expect(library.upload(big)).rejects.toThrow('larger than 10 MB');
    expect(library.images()).toEqual([]);
  });

  it('makes an object URL on first use and revokes it on removal', async () => {
    const create = vi.fn(() => 'blob:art');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const image = await library.upload(png());

    expect(library.url(image.id)).toBeUndefined();
    await settle();
    expect(library.url(image.id)).toBe('blob:art');
    expect(create).toHaveBeenCalledTimes(1);

    await library.remove(image.id);
    expect(revoke).toHaveBeenCalledWith('blob:art');
    expect(library.images()).toEqual([]);
    expect(await library.bytes(image.id)).toBeNull();
  });

  it('lists images already in storage, oldest first', async () => {
    const data = twoTonePng();
    const meta = (id: string, createdAt: string) => ({
      id,
      name: id,
      fileName: `${id}.png`,
      mimeType: 'image/png' as const,
      width: 4,
      height: 3,
      byteSize: data.byteLength,
      createdAt,
    });
    await repo.save({ meta: meta('b', '2026-02-01'), data });
    await repo.save({ meta: meta('a', '2026-01-01'), data });
    await library.refresh();
    expect(library.images().map((i) => i.id)).toEqual(['a', 'b']);
  });
});
