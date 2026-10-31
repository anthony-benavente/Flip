import { Page } from '@playwright/test';
import { clickAt, expect, FT, IN, newStarterRoom, panelHeading, savedPlan, test } from './helpers';

/** Places a catalog item at the middle of the view by clicking it in the toolbox. */
async function place(page: Page, name: string) {
  await page.locator('.item', { has: page.getByText(name, { exact: true }) }).click();
}

const byCatalog = (plan: any, id: string) => plan.furniture.find((f: any) => f.catalogId === id);

test.describe('interior design', () => {
  test('stacks a table lamp on a dresser without an overlap warning', async ({ page }) => {
    await newStarterRoom(page);
    await place(page, 'Dresser');
    await place(page, 'Table lamp');

    const plan = await savedPlan(page, (p) => p.furniture.length === 2);
    const dresser = byCatalog(plan, 'dresser');
    const lamp = byCatalog(plan, 'table-lamp');
    expect(lamp.elevation).toBeCloseTo(dresser.height, 5);
    await expect(page.locator('.furniture.overlap')).toHaveCount(0);
    await expect(page.getByLabel('Height off the floor')).toHaveValue(/2' 10"/);
  });

  test('hangs art at gallery height and shows it in 3D', async ({ page }) => {
    await newStarterRoom(page);
    await place(page, 'Framed print 16×20');

    const plan = await savedPlan(page, (p) => p.furniture.length === 1);
    const art = byCatalog(plan, 'art-small');
    expect(art.elevation + art.height / 2).toBeCloseTo(57 * IN, 5);

    await page.locator('.view-modes button', { hasText: 'Split' }).click();
    await expect(page.locator('app-preview3d canvas')).toBeVisible();
    await expect(page.getByText('Loading 3D view…')).toHaveCount(0);
  });

  test('applies a room color scheme with a patterned floor', async ({ page }) => {
    await newStarterRoom(page);
    await clickAt(page, 3 * FT, 10 * FT);
    await expect(panelHeading(page)).toHaveText('Room');
    await page.locator('.scheme', { hasText: 'Coastal' }).click();
    await expect(page.locator('.scheme.active')).toHaveText(/Coastal/);

    const plan = await savedPlan(page, (p) => p.rooms[0]?.floorMaterial === 'wood');
    expect(plan.rooms[0]).toMatchObject({ floorColor: '#e8dcc4', wallColor: '#e7eef0', ceilingColor: '#f7f6f3', trimColor: '#fbfbf9' });
    await expect(page.locator('.room-pattern')).toHaveAttribute('fill', /\/plan\/.+#floor-wood\)$/);

    await page.getByLabel('Ceiling height').fill(`9'`);
    await page.getByLabel('Ceiling height').press('Enter');
    await savedPlan(page, (p) => p.walls.every((w: any) => Math.abs(w.height - 9 * FT) < 0.01));
  });
});
