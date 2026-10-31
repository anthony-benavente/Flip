import { writeFile } from 'node:fs/promises';
import { expect, newStarterRoom, savedPlan, test } from './helpers';

test.describe('import and export', () => {
  test('exports a plan and imports it back unchanged', async ({ page }, testInfo) => {
    await newStarterRoom(page);
    await page.locator('.item', { hasText: 'Dresser' }).click();
    const before = await savedPlan(page, (p) => p.furniture.length === 1);

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
    expect(download.suggestedFilename()).toBe('My room.flip.json');
    const file = testInfo.outputPath('plan.flip.json');
    await download.saveAs(file);

    await page.getByTitle('All projects').click();
    await page.getByTitle('Delete').click();
    await page.locator('.card').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No projects yet')).toBeVisible();

    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.locator('app-plan-canvas')).toBeVisible();
    const after = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('flip.plan.'))!;
      return JSON.parse(localStorage.getItem(key)!);
    });
    expect(after).toEqual(before);
  });

  test('shows an error for a file that is not a plan', async ({ page }, testInfo) => {
    const file = testInfo.outputPath('bad.json');
    await writeFile(file, '{"nodes": 5}');
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.locator('.error')).toContainText('"nodes" must be a list.');
    await expect(page).toHaveURL(/\/$/);
  });
});
