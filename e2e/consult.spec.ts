import { Page } from '@playwright/test';
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
  await page.addInitScript(() => localStorage.setItem('flip.ai', JSON.stringify({ kind: 'anthropic', apiKey: 'sk-test', model: 'claude-sonnet-5-5', baseUrl: '' })));
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

  test('asks for an API key before the first message', async ({ page }) => {
    await newStarterRoom(page);
    await page.getByRole('tab', { name: 'Consult' }).click();
    await expect(panel(page).getByLabel('API key')).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
