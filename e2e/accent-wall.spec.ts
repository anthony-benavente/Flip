import { clickAt, expect, FT, newStarterRoom, panelHeading, savedPlan, test } from './helpers';

test('paints an accent wall that shows in the plan, survives reload and renders in 3D', async ({ page }, testInfo) => {
  await newStarterRoom(page);

  // The left wall of the starter room (no door or window on it).
  await clickAt(page, 0, 5 * FT);
  await expect(panelHeading(page)).toHaveText('Wall');
  const inside = page.locator('.wall-side').first();
  await expect(inside.locator('.side-label')).toHaveText('Facing Living room');
  await expect(page.locator('.wall-side').nth(1).locator('.side-label')).toHaveText('Outside');

  await inside.getByRole('button', { name: 'Navy accent for Facing Living room' }).click();
  await expect(inside.locator('.badge')).toHaveText('Accent');
  await expect(page.locator('.wall-accents line')).toHaveCount(1);
  await expect(page.locator('.wall-accents line')).toHaveAttribute('stroke', '#2f4a6d');
  await page.screenshot({ path: testInfo.outputPath('accent-2d.png') });

  await savedPlan(page, (p) => p.walls.some((w: any) => w.colors?.front === '#2f4a6d' || w.colors?.back === '#2f4a6d'));
  await page.reload();
  await expect(page.locator('.wall-accents line')).toHaveAttribute('stroke', '#2f4a6d');

  await page.locator('.view-modes button', { hasText: '3D' }).click();
  await expect(page.locator('app-preview3d canvas')).toBeVisible();
  await page.waitForTimeout(500); // let the debounced scene build render once for the screenshot
  await page.screenshot({ path: testInfo.outputPath('accent-3d.png') });
});
