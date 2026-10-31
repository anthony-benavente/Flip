import { TestBed } from '@angular/core/testing';
import { createStarterPlan } from '../model/defaults';
import { MemoryStorage } from '../testing/fixtures';
import { LocalPlanRepository } from './local-plan.repository';
import { PlanFileService } from './plan-file.service';
import { PLAN_REPOSITORY } from './plan-repository';
import { PlanFormatError } from './plan-migration';
import { createFurniture } from '../model/defaults';
import { boxGlb } from '../testing/glb';
import { MemoryModelRepository } from './memory-model.repository';
import { ModelLibrary } from './model-library';
import { MODEL_REPOSITORY } from './model-repository';

describe('PlanFileService', () => {
  let repo: LocalPlanRepository;
  let models: MemoryModelRepository;
  let service: PlanFileService;

  const file = (content: string, name = 'plan.flip.json') => new File([content], name, { type: 'application/json' });

  beforeEach(() => {
    repo = new LocalPlanRepository(new MemoryStorage());
    models = new MemoryModelRepository();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLAN_REPOSITORY, useValue: repo },
        { provide: MODEL_REPOSITORY, useValue: models },
      ],
    });
    service = TestBed.inject(PlanFileService);
  });

  it('imports a plan and keeps its id when it is free', async () => {
    const plan = createStarterPlan('Imported');
    const result = await service.import(file(JSON.stringify(plan)));
    expect(result.id).toBe(plan.id);
    expect(await repo.get(plan.id)).toEqual(plan);
  });

  it('assigns a new id when the plan already exists', async () => {
    const plan = createStarterPlan('Twice');
    await repo.save(plan);
    const result = await service.import(file(JSON.stringify(plan)));
    expect(result.id).not.toBe(plan.id);
    expect(await repo.list()).toHaveLength(2);
  });

  it('rejects files that are not JSON with a readable message', async () => {
    await expect(service.import(file('not json', 'notes.txt'))).rejects.toThrow('notes.txt is not valid JSON.');
  });

  it('rejects JSON that is not a plan', async () => {
    await expect(service.import(file('{"walls": 3}'))).rejects.toBeInstanceOf(PlanFormatError);
    expect(await repo.list()).toEqual([]);
  });

  describe('export', () => {
    let downloads: { name: string; href: string }[];

    beforeEach(() => {
      downloads = [];
      vi.useFakeTimers();
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push({ name: this.download, href: this.href });
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('downloads the plan as JSON with a safe file name', async () => {
      const plan = createStarterPlan('Mom\'s place: v2/final?');
      await service.export(plan);
      expect(downloads).toEqual([{ name: "Mom's place_ v2_final_.flip.json", href: 'blob:test' }]);
      const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
      expect(JSON.parse(await blob.text())).toEqual(plan);
      // The link is removed and the object URL released.
      expect(document.querySelector('a[download]')).toBeNull();
      vi.runAllTimers();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    });

    it('falls back to "plan" for an empty name', async () => {
      await service.export({ ...createStarterPlan(), name: '   ' });
      expect(downloads[0].name).toBe('plan.flip.json');
    });

    describe('with uploaded models', () => {
      const exported = async () => {
        const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as Blob;
        return JSON.parse(await blob.text());
      };

      async function planWithModel() {
        const library = TestBed.inject(ModelLibrary);
        const model = await library.upload(new File([boxGlb()], 'chair.glb'), 'office-chair', 'Aeron', { x: 0, y: 0, z: 0 });
        const plan = createStarterPlan('With model');
        plan.furniture.push({ ...createFurniture('office-chair', { x: 100, y: 100 }), modelId: model.id });
        plan.furniture.push(createFurniture('desk', { x: 200, y: 100 }));
        return { plan, model, library };
      }

      it('embeds the models the plan uses and restores them on import', async () => {
        const { plan, model, library } = await planWithModel();
        await library.upload(new File([boxGlb()], 'unused.glb'), 'desk', 'Unused', { x: 0, y: 0, z: 0 });
        await service.export(plan);
        const doc = await exported();
        expect(doc.models).toHaveLength(1);
        expect(doc.models[0].meta).toEqual(model);

        await library.remove(model.id);
        const imported = await service.import(file(JSON.stringify(doc)));
        expect(imported.furniture[0].modelId).toBe(model.id);
        expect('models' in (await repo.get(imported.id))!).toBe(false);
        expect(library.model(model.id)).toEqual(model);
        expect(new Uint8Array((await models.get(model.id))!.data)).toEqual(new Uint8Array(boxGlb()));
      });

      it('reuses an identical model and renames a clashing one', async () => {
        const { plan, model, library } = await planWithModel();
        await service.export(plan);
        const doc = await exported();

        await service.import(file(JSON.stringify(doc)));
        expect(library.models()).toHaveLength(1);

        // Same id, different file: kept side by side under a new id.
        await models.save({ meta: model, data: boxGlb([0, 0, 0], [2, 2, 2]) });
        const imported = await service.import(file(JSON.stringify(doc)));
        const newId = imported.furniture[0].modelId!;
        expect(newId).not.toBe(model.id);
        expect(library.model(newId)).toMatchObject({ name: 'Aeron', catalogId: 'office-chair' });
        expect(library.models()).toHaveLength(2);
      });

      it('rejects malformed embedded models before saving anything', async () => {
        const plan = createStarterPlan();
        await expect(service.import(file(JSON.stringify({ ...plan, models: [{ meta: { id: 'x' }, data: '' }] })))).rejects.toThrow(
          'A 3D model in this file is malformed.',
        );
        expect(await repo.list()).toEqual([]);
      });
    });
  });
});
