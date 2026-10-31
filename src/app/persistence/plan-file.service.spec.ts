import { TestBed } from '@angular/core/testing';
import { createStarterPlan } from '../model/defaults';
import { MemoryStorage } from '../testing/fixtures';
import { LocalPlanRepository } from './local-plan.repository';
import { PlanFileService } from './plan-file.service';
import { PLAN_REPOSITORY } from './plan-repository';
import { PlanFormatError } from './plan-migration';

describe('PlanFileService', () => {
  let repo: LocalPlanRepository;
  let service: PlanFileService;

  const file = (content: string, name = 'plan.flip.json') => new File([content], name, { type: 'application/json' });

  beforeEach(() => {
    repo = new LocalPlanRepository(new MemoryStorage());
    TestBed.configureTestingModule({ providers: [{ provide: PLAN_REPOSITORY, useValue: repo }] });
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
      service.export(plan);
      expect(downloads).toEqual([{ name: "Mom's place_ v2_final_.flip.json", href: 'blob:test' }]);
      const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
      expect(JSON.parse(await blob.text())).toEqual(plan);
      // The link is removed and the object URL released.
      expect(document.querySelector('a[download]')).toBeNull();
      vi.runAllTimers();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    });

    it('falls back to "plan" for an empty name', () => {
      service.export({ ...createStarterPlan(), name: '   ' });
      expect(downloads[0].name).toBe('plan.flip.json');
    });
  });
});
