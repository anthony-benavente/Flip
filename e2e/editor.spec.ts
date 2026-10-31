import { canvas, clickAt, expect, FT, IN, newStarterRoom, panelHeading, roomLabels, savedPlan, test, toScreen, zoomOut } from './helpers';

test.describe('floor plan editor', () => {
  test.beforeEach(async ({ page }) => {
    await newStarterRoom(page);
  });

  test('shows the starter room with labels and dimensions', async ({ page }) => {
    await expect(roomLabels(page)).toHaveText(['Living room168 sq ft']);
    await expect(page.locator('.dimension')).toHaveText([`12' 0"`, `14' 0"`, `12' 0"`, `14' 0"`]);
    await expect(page.locator('.door-arc')).toHaveCount(1);
    await expect(page.locator('.window-frame')).toHaveCount(1);
    await expect(page.locator('.save')).toHaveText('Saved');
  });

  test('drops furniture from the catalog flush against a wall', async ({ page }) => {
    const box = (await canvas(page).boundingBox())!;
    const near = await toScreen(page, 4 * FT, 1.5 * FT);
    const target = { x: near.x - box.x, y: near.y - box.y };
    await page.locator('.item', { hasText: 'Queen bed' }).dragTo(canvas(page), { targetPosition: target });
    await expect(panelHeading(page)).toHaveText('Queen bed');

    const plan = await savedPlan(page, (p) => p.furniture.some((f: any) => f.catalogId === 'bed-queen'));
    const bed = plan.furniture.find((f: any) => f.catalogId === 'bed-queen');
    const wallFace = (4.5 * IN) / 2;
    expect(bed.rotation).toBe(0);
    expect(bed.y).toBeCloseTo(wallFace + (84 * IN) / 2, 0);
    await expect(page.locator('.overlap-outline')).toHaveCount(0);
  });

  test('adds furniture by clicking and moves it by dragging', async ({ page }) => {
    await page.locator('.item', { hasText: 'Armchair' }).click();
    const chair = page.locator('g.furniture');
    await expect(chair).toHaveCount(1);
    const before = (await chair.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 - 60, before.y + before.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    const after = (await chair.boundingBox())!;
    expect(Math.round(after.x - before.x)).toBe(-60);
    expect(Math.round(after.y - before.y)).toBe(40);

    await page.keyboard.press('r');
    await expect(page.locator('app-properties-panel input[type=number]')).toHaveValue('90');
  });

  test('draws an adjoining room that is detected with its area', async ({ page }) => {
    await zoomOut(page, 3);
    await page.keyboard.press('w');
    for (const [x, y] of [
      [12 * FT, 0],
      [22 * FT, 0],
      [22 * FT, 14 * FT],
      [12 * FT, 14 * FT],
    ]) {
      await clickAt(page, x, y);
    }
    await expect(roomLabels(page)).toHaveText(['Living room168 sq ft', 'Room140 sq ft']);
    // The chain closed itself on the existing corner; the tool is ready for a new chain.
    await expect(page.locator('.chain-start')).toHaveCount(0);
  });

  test('places a wall at a typed length', async ({ page }) => {
    await zoomOut(page, 3);
    await page.keyboard.press('w');
    await clickAt(page, 2 * FT, 18 * FT);
    const toward = await toScreen(page, 6 * FT, 18 * FT);
    await page.mouse.move(toward.x, toward.y, { steps: 4 });
    await page.keyboard.type(`7' 6"`);
    await expect(page.locator('.typed')).toContainText(`7' 6"`);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.locator('.dimension', { hasText: `7' 6"` })).toHaveCount(1);
  });

  test('adds a door, renames a room and colors its floor', async ({ page }) => {
    await page.keyboard.press('d');
    await clickAt(page, 0, 7 * FT);
    await expect(panelHeading(page)).toHaveText('Door');
    await expect(page.locator('.door-arc')).toHaveCount(2);

    await page.keyboard.press('Escape');
    await clickAt(page, 3 * FT, 10 * FT);
    await expect(panelHeading(page)).toHaveText('Room');
    const name = page.locator('app-properties-panel input.input').first();
    await name.fill('Den');
    await name.press('Enter');
    await page.getByRole('button', { name: 'Walnut floor' }).click();
    await expect(roomLabels(page)).toHaveText(['Den168 sq ft']);
    await expect(page.locator('polygon.room')).toHaveAttribute('fill', '#7d5a3c');

    await page.getByTitle('Undo (Ctrl+Z)').click();
    await expect(page.locator('polygon.room')).not.toHaveAttribute('fill', '#7d5a3c');
    await page.getByTitle('Redo (Ctrl+Y)').click();
    await expect(page.locator('polygon.room')).toHaveAttribute('fill', '#7d5a3c');
  });

  test('switches between imperial and metric labels', async ({ page }) => {
    await page.locator('.units button', { hasText: 'm' }).click();
    await expect(roomLabels(page)).toHaveText(['Living room15.6 m²']);
    await expect(page.locator('.dimension').first()).toHaveText('3.66 m');
    await page.locator('.units button', { hasText: 'ft/in' }).click();
    await expect(roomLabels(page)).toHaveText(['Living room168 sq ft']);
  });

  test('keeps changes after a reload', async ({ page }) => {
    await page.locator('.item', { hasText: 'Sofa' }).first().click();
    await page.locator('.plan-name').fill('Reload test');
    await page.locator('.plan-name').press('Enter');
    await savedPlan(page, (p) => p.name === 'Reload test' && p.furniture.length === 1);
    await page.reload();
    await expect(page.locator('.plan-name')).toHaveValue('Reload test');
    await expect(page.locator('g.furniture')).toHaveCount(1);
  });

  test('opens the keyboard shortcut help', async ({ page }) => {
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
