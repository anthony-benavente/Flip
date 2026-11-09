import { TestBed } from '@angular/core/testing';
import { MAX_MODEL_BYTES } from '../model/custom-model';
import { boxGlb } from '../testing/glb';
import { MemoryModelRepository } from './memory-model.repository';
import { currentRenderKey, ModelLibrary } from './model-library';
import { MODEL_REPOSITORY } from './model-repository';

describe('ModelLibrary', () => {
  let repo: MemoryModelRepository;
  let library: ModelLibrary;
  const glb = (name = 'aeron_chair.glb') => new File([boxGlb()], name);
  const orientation = { x: 0, y: 1, z: 0 } as const;

  beforeEach(async () => {
    repo = new MemoryModelRepository();
    TestBed.configureTestingModule({ providers: [{ provide: MODEL_REPOSITORY, useValue: repo }] });
    library = TestBed.inject(ModelLibrary);
    await library.ready;
  });

  it('uploads a file as a variant of a template', async () => {
    const model = await library.upload(glb(), 'office-chair', '  Aeron ', orientation);
    expect(model).toMatchObject({ name: 'Aeron', catalogId: 'office-chair', fileName: 'aeron_chair.glb', orientation });
    expect(model.id).toMatch(/^m_/);
    expect(library.models()).toEqual([model]);
    expect(library.forTemplate('office-chair')).toEqual([model]);
    expect(library.forTemplate('desk')).toEqual([]);
    expect(library.model(model.id)).toEqual(model);
    expect(new Uint8Array((await repo.get(model.id))!.data)).toEqual(new Uint8Array(boxGlb()));
  });

  it('rejects files over the size limit', async () => {
    const big = glb();
    Object.defineProperty(big, 'size', { value: MAX_MODEL_BYTES + 1 });
    await expect(library.upload(big, 'desk', 'Huge', orientation)).rejects.toThrow('larger than 25 MB');
    expect(library.models()).toEqual([]);
  });

  it('lists models already in storage, oldest first', async () => {
    const data = boxGlb();
    const meta = (id: string, createdAt: string) => ({ id, name: id, catalogId: 'desk', fileName: 'a.glb', byteSize: 1, createdAt, orientation });
    await repo.save({ meta: meta('new', '2026-02-01'), data });
    await repo.save({ meta: meta('old', '2026-01-01'), data });
    await library.refresh();
    expect(library.models().map((m) => m.id)).toEqual(['old', 'new']);
  });

  it('updates settings and removes models', async () => {
    const model = await library.upload(glb(), 'desk', 'Oak', orientation);
    const turned = { x: 1, y: 0, z: 2 } as const;
    await library.update(model.id, { name: 'Walnut', catalogId: 'dresser', orientation: turned });
    expect(library.model(model.id)).toMatchObject({ name: 'Walnut', catalogId: 'dresser', orientation: turned, fileName: 'aeron_chair.glb' });
    expect((await repo.list())[0]).toMatchObject({ name: 'Walnut', catalogId: 'dresser', orientation: turned });
    await library.update(model.id, { name: '   ' });
    expect(library.model(model.id)?.name).toBe('Walnut');

    await library.remove(model.id);
    expect(library.models()).toEqual([]);
    expect(await library.bytes(model.id)).toBeNull();
  });

  describe('pictures', () => {
    let urls = 0;
    const revoked: string[] = [];
    const pictures = (key: string) => ({ key, top: new Blob(['top']), thumb: new Blob(['thumb']) });

    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    beforeEach(() => {
      urls = 0;
      revoked.length = 0;
      URL.createObjectURL = () => `blob:${++urls}`;
      URL.revokeObjectURL = (u: string) => void revoked.push(u);
    });
    afterEach(() => {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
    });

    it('lists models without current pictures, and shows saved pictures until the settings change', async () => {
      const model = await library.upload(glb(), 'desk', 'Oak', orientation);
      expect(library.staleRenders()).toEqual([model]);
      expect(library.topView(model.id)).toBeUndefined();

      await library.saveRenders(model.id, pictures(currentRenderKey(model)));
      expect(library.staleRenders()).toEqual([]);
      expect(library.topView(model.id)).toBe('blob:1');
      expect(library.thumbnail(model.id)).toBe('blob:2');

      await library.update(model.id, { name: 'Walnut' });
      expect(library.topView(model.id)).toBe('blob:1');
      await library.update(model.id, { orientation: { x: 0, y: 2, z: 0 } });
      expect(library.staleRenders().map((m) => m.id)).toEqual([model.id]);
      expect(library.topView(model.id)).toBeUndefined();
      expect(library.thumbnail(model.id)).toBeUndefined();
    });

    it('draws the symbol instead of the top view when the model asks for it', async () => {
      const model = await library.upload(glb(), 'desk', 'Oak', orientation, undefined, undefined, true);
      expect(model.planSymbol).toBe(true);
      await library.saveRenders(model.id, pictures(currentRenderKey(model)));
      expect(library.topView(model.id)).toBeUndefined();
      expect(library.thumbnail(model.id)).toBe('blob:2');
    });

    it('loads stored pictures, replaces them and frees their URLs', async () => {
      const model = await library.upload(glb(), 'desk', 'Oak', orientation);
      await repo.saveRenders(model.id, pictures(currentRenderKey(model)));
      await library.refresh();
      expect(library.topView(model.id)).toBe('blob:1');

      await library.saveRenders(model.id, pictures(currentRenderKey(model)));
      expect(library.topView(model.id)).toBe('blob:3');
      expect(revoked).toEqual(['blob:1', 'blob:2']);

      await library.remove(model.id);
      expect(revoked).toEqual(['blob:1', 'blob:2', 'blob:3', 'blob:4']);
      expect(await repo.listRenders()).toEqual(new Map());
    });

    it('drops pictures of a model deleted while they were drawn', async () => {
      const model = await library.upload(glb(), 'desk', 'Oak', orientation);
      await library.remove(model.id);
      await library.saveRenders(model.id, pictures(currentRenderKey(model)));
      expect(urls).toBe(0);
      expect(await repo.listRenders()).toEqual(new Map());
    });
  });

  it('reads file bytes once and caches them', async () => {
    const model = await library.upload(glb(), 'desk', 'Oak', orientation);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: MODEL_REPOSITORY, useValue: repo }] });
    const fresh = TestBed.inject(ModelLibrary);
    const get = vi.spyOn(repo, 'get');
    const [a, b] = await Promise.all([fresh.bytes(model.id), fresh.bytes(model.id)]);
    expect(a).toBe(b);
    expect(a!.byteLength).toBe(boxGlb().byteLength);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
