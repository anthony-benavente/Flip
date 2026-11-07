import { expect, newStarterRoom, test } from './helpers';

test.describe('3D preview', () => {
  test('renders in split and full 3D views', async ({ page }) => {
    await newStarterRoom(page);
    await page.locator('.item', { hasText: 'Sofa' }).first().click();

    await page.locator('.view-modes button', { hasText: 'Split' }).click();
    const gl = page.locator('app-preview3d canvas');
    await expect(gl).toBeVisible();
    await expect(page.locator('app-plan-canvas')).toBeVisible();
    await expect(page.getByText('Loading 3D view…')).toHaveCount(0);
    await expect(page.getByText('could not start')).toHaveCount(0);
    const split = (await gl.boundingBox())!;
    expect(split.width).toBeGreaterThan(300);

    await page.locator('.view-modes button', { hasText: '3D' }).click();
    await expect(page.locator('app-plan-canvas')).toBeHidden();
    await expect.poll(async () => (await gl.boundingBox())!.width).toBeGreaterThan(split.width);

    await page.getByRole('button', { name: 'Top', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Top', exact: true })).toHaveClass(/active/);
    await page.getByLabel('Cutaway walls').uncheck();

    await page.locator('.view-modes button', { hasText: 'Plan' }).click();
    await expect(gl).toHaveCount(0);
  });

  test('updates when the plan changes', async ({ page }) => {
    await newStarterRoom(page);
    await page.locator('.view-modes button', { hasText: 'Split' }).click();
    await expect(page.locator('app-preview3d canvas')).toBeVisible();
    // Editing while the preview is open must not throw (console errors fail the test).
    await page.locator('.item', { hasText: 'Bookshelf' }).click();
    await page.keyboard.press('r');
    await page.keyboard.press('Delete');
    await expect(page.locator('g.furniture')).toHaveCount(0);
  });

  test('walks through the room with the keyboard and leaves with Esc', async ({ page }) => {
    await newStarterRoom(page);
    await page.locator('.view-modes button', { hasText: '3D' }).click();
    await expect(page.getByText('Loading 3D view…')).toHaveCount(0);
    const gl = page.locator('app-preview3d canvas');
    const walk = page.locator('app-preview3d .controls .btn', { hasText: /walk/i });
    await walk.click();
    await expect(walk).toHaveClass(/active/);
    await expect(walk).toHaveText(/Exit walk/);
    await expect(page.getByText('Shift to run')).toBeVisible();

    // W moves the camera, and must not also switch the editor to the wall tool.
    const before = await gl.screenshot();
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.keyboard.up('w');
    await expect.poll(async () => (await gl.screenshot()).equals(before)).toBe(false);
    await expect(page.locator('.tool.active')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.tool.active')).not.toContainText(/wall/i);

    await page.keyboard.press('Escape');
    await expect(walk).not.toHaveClass(/active/);
    await expect(walk).toHaveText(/^\s*Walk\s*$/);
    await expect(page.getByText('drag to orbit')).toBeVisible();
  });
});
