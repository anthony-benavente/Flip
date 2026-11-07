import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { createStarterPlan } from '../model/defaults';
import { LocalPlanRepository } from '../persistence/local-plan.repository';
import { PLAN_REPOSITORY } from '../persistence/plan-repository';
import { ToastService } from '../shared/toast';
import { MemoryStorage } from '../testing/fixtures';
import { ProjectsPage } from './projects-page';

describe('ProjectsPage', () => {
  let fixture: ComponentFixture<ProjectsPage>;
  let repo: LocalPlanRepository;
  let navigate: ReturnType<typeof vi.spyOn>;
  let el: HTMLElement;

  /** Lets the page's repository promises resolve, then renders. */
  const settle = async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text)!;

  const create = async () => {
    fixture = TestBed.createComponent(ProjectsPage);
    el = fixture.nativeElement;
    await settle();
  };

  beforeEach(() => {
    repo = new LocalPlanRepository(new MemoryStorage());
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: PLAN_REPOSITORY, useValue: repo }] });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('shows the empty state with no projects', async () => {
    await create();
    expect(el.textContent).toContain('No projects yet');
    expect(el.querySelectorAll('.card')).toHaveLength(0);
  });

  it('creates a starter room and opens it', async () => {
    await create();
    button('New room').click();
    await settle();
    const [summary] = await repo.list();
    expect(summary.name).toBe('My room');
    expect((await repo.get(summary.id))?.walls).toHaveLength(4);
    expect(navigate).toHaveBeenCalledWith(['/plan', summary.id]);
  });

  it('creates a blank plan', async () => {
    await create();
    button('Blank plan').click();
    await settle();
    const [summary] = await repo.list();
    expect((await repo.get(summary.id))?.walls).toEqual([]);
  });

  describe('with projects', () => {
    beforeEach(async () => {
      await repo.save(createStarterPlan('Den'));
      await create();
    });

    it('lists them with a thumbnail and stats', () => {
      expect(el.querySelectorAll('.card')).toHaveLength(1);
      expect(el.querySelector('.name')?.textContent).toContain('Den');
      expect(el.querySelector('.sub')?.textContent).toContain('4 walls');
      expect(el.querySelector('app-plan-thumbnail svg')).not.toBeNull();
    });

    it('deletes at once and offers Undo in a toast', async () => {
      el.querySelector<HTMLButtonElement>('button[title="Delete"]')!.click();
      await settle();
      expect(await repo.list()).toEqual([]);
      expect(el.textContent).toContain('No projects yet');
      const toast = TestBed.inject(ToastService).toasts()[0];
      expect(toast.message).toBe('Deleted “Den”');

      TestBed.inject(ToastService).act(toast);
      await settle();
      expect((await repo.list()).map((s) => s.name)).toEqual(['Den']);
      expect(el.querySelectorAll('.card')).toHaveLength(1);
    });

    it('duplicates a project', async () => {
      el.querySelector<HTMLButtonElement>('button[title="Duplicate"]')!.click();
      await settle();
      expect((await repo.list()).map((s) => s.name).sort()).toEqual(['Den', 'Den copy']);
      expect(el.querySelectorAll('.card')).toHaveLength(2);
    });

    it('renames a project', async () => {
      el.querySelector<HTMLButtonElement>('button[title="Rename"]')!.click();
      await settle();
      const input = el.querySelector<HTMLInputElement>('.card input')!;
      input.value = 'Study';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
      expect((await repo.list())[0].name).toBe('Study');
    });

    it('cancels a rename with Escape, even though the field blurs afterward', async () => {
      el.querySelector<HTMLButtonElement>('button[title="Rename"]')!.click();
      await settle();
      const input = el.querySelector<HTMLInputElement>('.card input')!;
      input.value = 'Study';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      input.dispatchEvent(new FocusEvent('blur'));
      await settle();
      expect((await repo.list())[0].name).toBe('Den');
      expect(el.querySelector('.card input')).toBeNull();
    });
  });

  it('shows an error for a bad import file', async () => {
    await create();
    const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
    const bad = new File(['{"nodes": 5}'], 'bad.json');
    Object.defineProperty(input, 'files', { value: [bad], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(el.querySelector('.error')?.textContent).toContain('"nodes" must be a list.');
    expect(navigate).not.toHaveBeenCalled();
  });
});
