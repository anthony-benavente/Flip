import { writeFile } from 'node:fs/promises';
import { Page } from '@playwright/test';
import { boxGlb } from '../src/app/testing/glb';
import { expect, newStarterRoom, savedPlan, test } from './helpers';

const library = (page: Page) => page.getByRole('tabpanel', { name: '3D models' });
const furnitureTab = (page: Page) => page.getByRole('tab', { name: 'Decor' });
const uploadDialog = (page: Page) => page.getByRole('dialog', { name: 'Upload 3D model' });
const editDialog = (page: Page) => page.getByRole('dialog', { name: 'Edit 3D model' });

/** Opens the Models panel and the upload dialog from it. */
async function openUpload(page: Page) {
  await page.getByRole('button', { name: '3D models' }).click();
  await library(page).getByRole('button', { name: 'Upload model' }).click();
  return uploadDialog(page);
}

async function uploadModel(page: Page, file: string, name?: string) {
  const dialog = await openUpload(page);
  await dialog.getByLabel('Model file').setInputFiles(file);
  await expect(dialog.getByRole('button', { name: 'Add to furniture' })).toBeEnabled();
  if (name) await dialog.getByLabel('Model name').fill(name);
  await dialog.getByRole('button', { name: 'Add to furniture' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(library(page)).toHaveCount(0);
}

test.describe('uploaded 3D models', () => {
  test('uploads a model as an office chair, places it and shows it in 3D', async ({ page }, testInfo) => {
    const file = testInfo.outputPath('aeron.glb');
    await writeFile(file, new Uint8Array(boxGlb([0, 0, 0], [0.6, 1.1, 0.6])));
    await newStarterRoom(page);

    const dialog = await openUpload(page);
    await expect(dialog.getByLabel('Use as')).toHaveValue('office-chair');
    await dialog.getByLabel('Model file').setInputFiles(file);
    await expect(dialog.getByLabel('Model name')).toHaveValue('aeron');
    await dialog.getByLabel('Model name').fill('Aeron');
    await dialog.getByTitle('Turn 90° about Y').click();
    await dialog.getByRole('button', { name: 'Add to furniture' }).click();
    await expect(dialog).toHaveCount(0);

    const entry = page.locator('.item', { hasText: 'Office chair · Aeron' });
    await expect(entry).toContainText('3D');
    await entry.click();
    const plan = await savedPlan(page, (p) => p.furniture.length === 1);
    const modelId = plan.furniture[0].modelId;
    expect(modelId).toMatch(/^m_/);
    expect(plan.furniture[0].catalogId).toBe('office-chair');
    await expect(page.getByLabel('3D model')).toHaveValue(modelId);

    await page.locator('.view-modes button', { hasText: 'Split' }).click();
    await expect(page.locator('app-preview3d canvas')).toBeVisible();
    await expect(page.getByText('Loading 3D view…')).toHaveCount(0);

    // Switch back to the built-in look, then to the model again.
    await page.getByLabel('3D model').selectOption({ label: 'Default' });
    await savedPlan(page, (p) => !p.furniture[0].modelId);
    await page.getByLabel('3D model').selectOption({ label: 'Aeron' });
    await savedPlan(page, (p) => p.furniture[0].modelId === modelId);
  });

  test('rejects a file that is not a model', async ({ page }, testInfo) => {
    const file = testInfo.outputPath('broken.glb');
    await writeFile(file, 'not a model');
    await newStarterRoom(page);
    const dialog = await openUpload(page);
    await dialog.getByLabel('Model file').setInputFiles(file);
    await expect(dialog.getByRole('alert')).toContainText('broken.glb could not be read');
    await expect(dialog.getByRole('button', { name: 'Add to furniture' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(library(page)).toBeVisible();
  });

  test('edits a model after upload from the library and from the catalog', async ({ page }, testInfo) => {
    const file = testInfo.outputPath('chair.glb');
    await writeFile(file, new Uint8Array(boxGlb()));
    await newStarterRoom(page);
    await uploadModel(page, file, 'Mesh');
    await page.locator('.item', { hasText: 'Office chair · Mesh' }).click();
    const { furniture } = await savedPlan(page, (p) => p.furniture.length === 1);
    const modelId = furniture[0].modelId;

    await page.getByRole('button', { name: '3D models' }).click();
    const row = library(page).getByRole('listitem', { name: 'Mesh' });
    await expect(row).toContainText('Used by 1 item in this plan');
    await row.getByRole('button', { name: 'Edit' }).click();

    const dialog = editDialog(page);
    await expect(dialog.getByLabel('Model file')).toHaveCount(0);
    await expect(dialog.getByLabel('Model name')).toHaveValue('Mesh');
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await dialog.getByLabel('Model name').fill('Mesh task chair');
    await dialog.getByLabel('Use as').selectOption({ label: 'Armchair' });
    await dialog.getByTitle('Turn 90° about X').click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(library(page).getByRole('listitem', { name: 'Mesh task chair' })).toContainText('Armchair');
    await furnitureTab(page).click();

    // The catalog entry moved to the new template; the placed item keeps the same model.
    await expect(page.locator('.item', { hasText: 'Armchair · Mesh task chair' })).toBeVisible();
    await expect(page.locator('.item', { hasText: 'Office chair · Mesh' })).toHaveCount(0);
    await expect(page.getByLabel('3D model')).toHaveValue(modelId);
    const stored = await page.evaluate(
      (id) =>
        new Promise<any>((resolve, reject) => {
          const req = indexedDB.open('flip-models');
          req.onsuccess = () => {
            const get = req.result.transaction('meta').objectStore('meta').get(id);
            get.onsuccess = () => resolve(get.result);
            get.onerror = () => reject(get.error);
          };
        }),
      modelId,
    );
    expect(stored).toMatchObject({ name: 'Mesh task chair', catalogId: 'armchair', orientation: { x: 1, y: 0, z: 0 } });

    // Reopening from the catalog entry shows the saved settings.
    const entry = page.locator('li', { hasText: 'Armchair · Mesh task chair' });
    await entry.hover();
    await entry.getByRole('button', { name: 'Edit model' }).click();
    await expect(editDialog(page).getByLabel('Use as')).toHaveValue('armchair');
    await editDialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(editDialog(page)).toHaveCount(0);
  });

  test('deletes a model; placed items fall back to the default look', async ({ page }, testInfo) => {
    const file = testInfo.outputPath('desk.glb');
    await writeFile(file, new Uint8Array(boxGlb()));
    await newStarterRoom(page);
    await page.locator('.item', { hasText: 'Desk' }).first().click();
    await savedPlan(page, (p) => p.furniture.length === 1);

    const dialog = await openUpload(page);
    // The selected desk preselects its template.
    await expect(dialog.getByLabel('Use as')).toHaveValue('desk');
    await dialog.getByLabel('Model file').setInputFiles(file);
    await dialog.getByRole('button', { name: 'Add to furniture' }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByLabel('3D model').selectOption({ label: 'desk' });
    await savedPlan(page, (p) => !!p.furniture[0].modelId);

    await page.getByRole('button', { name: '3D models' }).click();
    const row = library(page).getByRole('listitem', { name: 'desk' });
    await row.getByRole('button', { name: 'Delete model' }).click();
    await expect(row).toContainText('Items using it will show the default model.');
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(library(page)).toContainText('No models yet');
    await furnitureTab(page).click();

    await expect(page.locator('.item', { hasText: 'Desk · desk' })).toHaveCount(0);
    await expect(page.getByText('uploaded model was deleted')).toBeVisible();
  });
});

test.describe('icon rail', () => {
  test('switches between furniture, models and rooms', async ({ page }) => {
    await newStarterRoom(page);
    await expect(page.getByRole('tab', { name: 'Decor' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.item').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Models' }).click();
    await expect(library(page)).toContainText('No models yet');
    await expect(page.locator('.item')).toHaveCount(0);
    // The drawing tools stay in reach on every tab.
    await expect(page.getByRole('button', { name: /^Wall/ })).toBeVisible();

    await page.getByRole('tab', { name: 'Rooms' }).click();
    const rooms = page.getByRole('tabpanel', { name: 'Rooms' });
    await expect(rooms.getByRole('button')).toHaveCount(1);
    await rooms.getByRole('button').click();
    await expect(page.locator('app-properties-panel h2')).toHaveText('Room');
  });

  test('resizes the sidebar and remembers the width after a reload', async ({ page }) => {
    await newStarterRoom(page);
    const sidebar = page.locator('app-toolbox');
    const before = (await sidebar.boundingBox())!.width;

    const handle = page.getByRole('separator', { name: 'Sidebar width' });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + 200, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeCloseTo(before + 80, -1);

    await page.reload();
    await expect(sidebar).toBeVisible();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeCloseTo(before + 80, -1);

    // Keys move the divider without nudging anything on the plan; double-click resets.
    await handle.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeCloseTo(before + 64, -1);
    await handle.dblclick();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeCloseTo(before, -1);
  });
});
