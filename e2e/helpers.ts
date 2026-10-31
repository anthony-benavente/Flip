import { expect, test as base, Locator, Page } from '@playwright/test';

export const FT = 30.48;
export const IN = 2.54;

/** Fails the test if the page logs an error or throws. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Opens the project list and starts the 12' x 14' starter room. */
export async function newStarterRoom(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with a room' }).click();
  await expect(page.locator('.room-label')).toContainText('168 sq ft');
}

export const canvas = (page: Page): Locator => page.locator('app-plan-canvas svg.canvas');
export const roomLabels = (page: Page): Locator => page.locator('.room-label');
export const panelHeading = (page: Page): Locator => page.locator('app-properties-panel h2');

/** Converts a plan point (cm) to page coordinates using the canvas's current transform. */
export async function toScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return canvas(page).evaluate(
    (svg, p) => {
      const r = svg.getBoundingClientRect();
      const m = (svg.querySelector('g') as SVGGElement).transform.baseVal.consolidate()!.matrix;
      return { x: r.left + m.e + p.x * m.a, y: r.top + m.f + p.y * m.a };
    },
    { x, y },
  );
}

/** Clicks a plan point (cm), moving there first so tools see hover state. */
export async function clickAt(page: Page, x: number, y: number): Promise<void> {
  const s = await toScreen(page, x, y);
  await page.mouse.move(s.x, s.y, { steps: 3 });
  await page.mouse.click(s.x, s.y);
}

/** Zooms out with the canvas button and waits for the view to re-render. */
export async function zoomOut(page: Page, times = 1): Promise<void> {
  const level = page.locator('.zoom-level');
  for (let i = 0; i < times; i++) {
    const before = await level.textContent();
    await page.getByTitle('Zoom out').click();
    await expect(level).not.toHaveText(before ?? '');
  }
}

/**
 * Waits until autosave has stored a plan matching `ready`, then returns it.
 * Polling storage avoids racing the "Saved" label, which can still show from before the latest change.
 */
export async function savedPlan(page: Page, ready: (plan: any) => boolean = () => true): Promise<any> {
  const read = () =>
    page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('flip.plan.'));
      return key ? JSON.parse(localStorage.getItem(key)!) : null;
    });
  await expect.poll(async () => {
    const plan = await read();
    return !!plan && ready(plan);
  }).toBe(true);
  await expect(page.locator('.save')).toHaveText('Saved');
  return read();
}
