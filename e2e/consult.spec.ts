import { writeFile } from 'node:fs/promises';
import { Page } from '@playwright/test';
import { boxGlb } from '../src/app/testing/glb';
import { expect, newStarterRoom, savedPlan, test } from './helpers';

const panel = (page: Page) => page.getByRole('tabpanel', { name: 'Consult' });

/** The Messages API stream for a reply made of these content blocks. */
function claudeStream(content: any[]): string {
  const events: [string, unknown][] = [['message_start', { type: 'message_start' }]];
  content.forEach((b, index) => {
    if (b.type === 'text') {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: b.text } }]);
    } else {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } }]);
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index }]);
  });
  events.push(['message_stop', { type: 'message_stop' }]);
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

/** Answers each request to the Claude API with the next scripted reply, streamed like the real one. */
async function scriptClaude(page: Page, replies: object[][]) {
  await page.addInitScript(() => localStorage.setItem('flip.ai', JSON.stringify({ kind: 'anthropic', apiKey: 'sk-test', model: 'claude-sonnet-5-5', baseUrl: '', screenshots: 'all' })));
  const requests: any[] = [];
  await page.route('https://api.anthropic.com/v1/messages', async (route) => {
    requests.push(route.request().postDataJSON());
    const content = replies.shift() ?? [{ type: 'text', text: 'Nothing more.' }];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'access-control-allow-origin': '*' },
      body: claudeStream(content),
    });
  });
  return requests;
}

test.describe('consult', () => {
  test('the AI edits the plan through commands; the user keeps or discards the changes', async ({ page }) => {
    const requests = await scriptClaude(page, [
      [{ type: 'tool_use', id: 't1', name: 'place_furniture', input: { catalogId: 'sofa-3', x: 200, y: 200, rotation: 0, label: 'Consult sofa' } }],
      [{ type: 'tool_use', id: 't2', name: 'set_room', input: { room: 'Living room', scheme: 'Moody' } }],
      [{ type: 'text', text: 'Added a sofa and a moody palette.' }],
    ]);
    await newStarterRoom(page);
    await page.getByRole('tab', { name: 'Consult' }).click();

    await panel(page).getByLabel('Message').fill('Make it cozy');
    await panel(page).getByRole('button', { name: 'Send' }).click();

    await expect(panel(page).getByText('Added a sofa and a moody palette.')).toBeVisible();
    await expect(panel(page).getByRole('group', { name: 'Proposed changes' })).toContainText('2 changes applied');
    await savedPlan(page, (p) => p.furniture.some((f: any) => f.label === 'Consult sofa'));

    // The model was offered the commands and got results back.
    expect(requests[0].tools.map((t: any) => t.name)).toContain('hang_on_wall');
    expect(requests[2].messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't2', is_error: false });

    await panel(page).getByRole('button', { name: 'Discard' }).click();
    await expect(panel(page).getByRole('group', { name: 'Proposed changes' })).toHaveCount(0);
    await savedPlan(page, (p) => !p.furniture.some((f: any) => f.label === 'Consult sofa') && !p.rooms.some((r: any) => r.floorColor === '#5c4433'));
  });

  test('window.flip runs the same commands for other agents', async ({ page }) => {
    await newStarterRoom(page);
    const names = await page.evaluate(() => (window as any).flip.commands().map((c: any) => c.name));
    expect(names).toContain('place_furniture');
    const result = await page.evaluate(() => (window as any).flip.run('place_furniture', { catalogId: 'plant', x: 100, y: 100, label: 'Agent plant' }));
    expect(result.ok).toBe(true);
    await page.getByRole('tab', { name: 'Consult' }).click();
    await expect(panel(page).getByRole('group', { name: 'Proposed changes' })).toContainText('1 change applied');
    await panel(page).getByRole('button', { name: 'Keep' }).click();
    await savedPlan(page, (p) => p.furniture.some((f: any) => f.label === 'Agent plant'));
  });

  test('the AI applies a model the user uploaded, and Discard takes it back', async ({ page }, testInfo) => {
    await newStarterRoom(page);
    const file = testInfo.outputPath('aeron.glb');
    await writeFile(file, Buffer.from(boxGlb([0, 0, 0], [0.6, 1, 0.6])));
    await page.getByRole('tab', { name: 'Models' }).click();
    await page.getByRole('button', { name: 'Upload model' }).click();
    const dialog = page.getByRole('dialog', { name: 'Upload 3D model' });
    await dialog.getByLabel('Model file').setInputFiles(file);
    await expect(dialog.getByRole('button', { name: 'Add to furniture' })).toBeEnabled();
    await dialog.getByLabel('Model name').fill('Aeron');
    await dialog.getByRole('button', { name: 'Add to furniture' }).click();
    await expect(dialog).toHaveCount(0);

    const result = await page.evaluate(() => {
      const flip = (window as any).flip;
      const chair = flip.run('place_furniture', { catalogId: 'office-chair', x: 200, y: 200, rotation: 0 });
      const uploads = flip.run('list_uploads');
      const modelId = uploads.output.models[0].modelId;
      return { chair, set: flip.run('set_furniture_model', { id: chair.output.id, modelId }), modelId };
    });
    expect(result.set.ok).toBe(true);
    await savedPlan(page, (p) => p.furniture.some((f: any) => f.modelId === result.modelId));

    await page.getByRole('tab', { name: 'Consult' }).click();
    await panel(page).getByRole('button', { name: 'Discard' }).click();
    await savedPlan(page, (p) => p.furniture.length === 0);
  });

  test('the AI looks at a screenshot of the plan and the user sees it too', async ({ page }) => {
    const requests = await scriptClaude(page, [
      [{ type: 'tool_use', id: 't1', name: 'view_plan', input: { view: 'top' } }],
      [{ type: 'text', text: 'The layout looks fine.' }],
    ]);
    await newStarterRoom(page);
    await page.getByRole('tab', { name: 'Consult' }).click();
    await panel(page).getByLabel('Message').fill('How does it look?');
    await panel(page).getByRole('button', { name: 'Send' }).click();

    await expect(panel(page).getByText('The layout looks fine.')).toBeVisible();
    await expect(panel(page).getByRole('img', { name: 'Screenshot the AI looked at' })).toBeVisible();
    expect(requests[0].tools.map((t: any) => t.name)).toContain('view_plan');
    const result = requests[1].messages.at(-1).content[0];
    expect(result.content.at(-1)).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    expect(result.content.at(-1).source.data.length).toBeGreaterThan(5000);
  });

  test('window.flip.snapshot renders the plan whatever view the editor is in', async ({ page }) => {
    await newStarterRoom(page);
    for (const view of ['top', 'corner']) {
      const url = await page.evaluate((v) => (window as any).flip.snapshot(v), view);
      expect(url).toMatch(/^data:image\/jpeg;base64,/);
      expect(url.length).toBeGreaterThan(5000);
    }
  });

  test('screenshots default to the corner view and can be changed in the chat box', async ({ page }) => {
    const requests = await scriptClaude(page, [[{ type: 'text', text: 'one' }], [{ type: 'text', text: 'two' }]]);
    await newStarterRoom(page);
    await page.getByRole('tab', { name: 'Consult' }).click();
    const choice = panel(page).getByLabel('Screenshots');
    // The scripted settings above start at "all"; pick each mode and check what the model is offered.
    await expect(choice).toHaveValue('all');
    await choice.selectOption('corner');
    await panel(page).getByLabel('Message').fill('hello');
    await panel(page).getByRole('button', { name: 'Send' }).click();
    await expect(panel(page).getByText('one')).toBeVisible();
    expect(requests[0].tools.find((t: any) => t.name === 'view_plan').input_schema.properties.view.enum).toEqual(['corner']);

    await choice.selectOption('off');
    await panel(page).getByLabel('Message').fill('again');
    await panel(page).getByRole('button', { name: 'Send' }).click();
    await expect(panel(page).getByText('two')).toBeVisible();
    expect(requests[1].tools.map((t: any) => t.name)).not.toContain('view_plan');
  });

  test('asks for an API key before the first message', async ({ page }) => {
    await newStarterRoom(page);
    await page.getByRole('tab', { name: 'Consult' }).click();
    await expect(panel(page).getByLabel('API key')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
