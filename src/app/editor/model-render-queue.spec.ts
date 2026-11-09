import { TestBed } from '@angular/core/testing';
import { catalogItem } from '../model/catalog';
import { MemoryModelRepository } from '../persistence/memory-model.repository';
import { currentRenderKey, ModelLibrary } from '../persistence/model-library';
import { MODEL_REPOSITORY } from '../persistence/model-repository';
import type { ModelPictureRequest } from '../preview3d/model-render';
import { boxGlb } from '../testing/glb';
import { MODEL_PICTURE_RENDERER, ModelRenderQueue } from './model-render-queue';

describe('ModelRenderQueue', () => {
  let repo: MemoryModelRepository;
  let library: ModelLibrary;
  let render: ReturnType<typeof vi.fn<(r: ModelPictureRequest) => Promise<{ top: Blob; thumb: Blob }>>>;
  const orientation = { x: 0, y: 1, z: 0 } as const;
  const glb = () => new File([boxGlb()], 'chair.glb');

  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  beforeEach(async () => {
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => undefined;
    repo = new MemoryModelRepository();
    render = vi.fn(async () => ({ top: new Blob(['top']), thumb: new Blob(['thumb']) }));
    TestBed.configureTestingModule({
      providers: [{ provide: MODEL_REPOSITORY, useValue: repo }, { provide: MODEL_PICTURE_RENDERER, useValue: render }, ModelRenderQueue],
    });
    library = TestBed.inject(ModelLibrary);
    await library.ready;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  const settle = async (queue: ModelRenderQueue) => {
    TestBed.tick();
    await queue.idle;
  };

  it('renders models without current pictures and stores them under the current key', async () => {
    const model = await library.upload(glb(), 'desk', 'Oak', orientation, undefined, { '0': '#ff0000' });
    const queue = TestBed.inject(ModelRenderQueue);
    await settle(queue);

    const desk = catalogItem('desk');
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][0]).toMatchObject({ orientation, colors: { '0': '#ff0000' }, width: desk.width, depth: desk.depth, height: desk.height });
    expect(render.mock.calls[0][0].data.byteLength).toBe(boxGlb().byteLength);
    expect((await repo.listRenders()).get(model.id)?.key).toBe(currentRenderKey(model));
    expect(library.staleRenders()).toEqual([]);

    await library.update(model.id, { catalogId: 'dresser' });
    await settle(queue);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1][0].width).toBe(catalogItem('dresser').width);
  });

  it('does not retry a model that failed until its settings change', async () => {
    render.mockRejectedValueOnce(new Error('bad file'));
    const model = await library.upload(glb(), 'desk', 'Oak', orientation);
    const queue = TestBed.inject(ModelRenderQueue);
    await settle(queue);
    await library.upload(glb(), 'desk', 'Pine', orientation);
    await settle(queue);
    expect(render).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith('Could not draw pictures of the model "Oak".', expect.any(Error));

    await library.update(model.id, { orientation: { x: 0, y: 0, z: 0 } });
    await settle(queue);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('stops when the browser has no WebGL', async () => {
    const noWebGl = Object.assign(new Error('no WebGL'), { name: 'WebGLUnavailable' });
    render.mockRejectedValue(noWebGl);
    await library.upload(glb(), 'desk', 'Oak', orientation);
    await library.upload(glb(), 'desk', 'Pine', orientation);
    const queue = TestBed.inject(ModelRenderQueue);
    await settle(queue);
    await library.upload(glb(), 'desk', 'Ash', orientation);
    await settle(queue);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
