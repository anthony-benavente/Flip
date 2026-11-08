import { AiMessage, AiRequest } from './ai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { OpenAiCompatibleProvider } from './openai-provider';

const request: AiRequest = {
  system: 'be helpful',
  tools: [{ name: 'get_plan', description: 'reads', inputSchema: { type: 'object', properties: {} } }],
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'looking' }, { type: 'tool_use', id: 't1', name: 'get_plan', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: '{"rooms":[]}' }] },
  ],
};

function respond(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, statusText: status === 200 ? 'OK' : 'Bad' });
  };
  return { fetcher, calls, sent: () => JSON.parse(calls[0].init.body as string) };
}

describe('AnthropicProvider', () => {
  it('posts tools and messages in Messages API form and reads tool calls back', async () => {
    const api = respond({ content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 'u1', name: 'get_plan', input: { a: 1 } }, { type: 'thinking' }] });
    const reply = await new AnthropicProvider('sk-test', 'claude-sonnet-5-5', api.fetcher).send(request);

    expect(api.calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    const headers = api.calls[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = api.sent();
    expect(body).toMatchObject({ model: 'claude-sonnet-5-5', system: 'be helpful' });
    expect(body.tools[0]).toMatchObject({ name: 'get_plan', input_schema: { type: 'object' } });
    expect(body.messages[2].content[0]).toEqual({ type: 'tool_result', tool_use_id: 't1', content: '{"rooms":[]}', is_error: false });
    expect(reply.content).toEqual([
      { type: 'text', text: 'ok' },
      { type: 'tool_use', id: 'u1', name: 'get_plan', input: { a: 1 } },
    ]);
  });

  it('turns an API error into a readable message', async () => {
    const api = respond({ error: { message: 'invalid x-api-key' } }, 401);
    await expect(new AnthropicProvider('bad', 'm', api.fetcher).send(request)).rejects.toThrow('401 Bad: invalid x-api-key');
  });
});

describe('OpenAiCompatibleProvider', () => {
  it('maps messages, tools and tool results to chat completions', async () => {
    const api = respond({
      choices: [{ message: { content: 'ok', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_plan', arguments: '{"a":1}' } }] } }],
    });
    const reply: AiMessage = await new OpenAiCompatibleProvider('http://localhost:11434/v1/', '', 'llama', api.fetcher).send(request);

    expect(api.calls[0].url).toBe('http://localhost:11434/v1/chat/completions');
    expect((api.calls[0].init.headers as Record<string, string>)['authorization']).toBeUndefined();
    const body = api.sent();
    expect(body.messages[0]).toEqual({ role: 'system', content: 'be helpful' });
    expect(body.tools[0].function).toMatchObject({ name: 'get_plan', parameters: { type: 'object' } });
    expect(body.messages[2]).toMatchObject({ role: 'assistant', content: 'looking', tool_calls: [{ id: 't1', function: { name: 'get_plan', arguments: '{}' } }] });
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: '{"rooms":[]}' });
    expect(reply.content).toEqual([
      { type: 'text', text: 'ok' },
      { type: 'tool_use', id: 'c1', name: 'get_plan', input: { a: 1 } },
    ]);
  });

  it('sends the key as a bearer token', async () => {
    const api = respond({ choices: [{ message: { content: 'hi' } }] });
    await new OpenAiCompatibleProvider('https://x/v1', 'sk-1', 'm', api.fetcher).send(request);
    expect((api.calls[0].init.headers as Record<string, string>)['authorization']).toBe('Bearer sk-1');
  });

  it('switches to the Responses API for a model that only allows tools there', async () => {
    const calls: { url: string; body: any }[] = [];
    const fetcher = async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      calls.push({ url, body });
      if (url.endsWith('/chat/completions')) {
        return new Response(JSON.stringify({ error: { message: 'Function tools with reasoning_effort are not supported for m-resp in /v1/chat/completions. To use function tools, use /v1/responses.' } }), { status: 400, statusText: 'Bad Request' });
      }
      return new Response(
        JSON.stringify({
          output: [
            { type: 'reasoning', summary: [] },
            { type: 'message', content: [{ type: 'output_text', text: 'ok' }] },
            { type: 'function_call', call_id: 'c9', name: 'get_plan', arguments: '{"a":1}' },
          ],
        }),
        { status: 200 },
      );
    };
    const reply = await new OpenAiCompatibleProvider('https://x/v1', 'k', 'm-resp', fetcher).send(request);

    expect(calls.map((c) => c.url)).toEqual(['https://x/v1/chat/completions', 'https://x/v1/responses']);
    const sent = calls[1].body;
    expect(sent).toMatchObject({ model: 'm-resp', instructions: 'be helpful' });
    expect(sent.tools[0]).toMatchObject({ type: 'function', name: 'get_plan', parameters: { type: 'object' } });
    expect(sent.input).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'looking' },
      { type: 'function_call', call_id: 't1', name: 'get_plan', arguments: '{}' },
      { type: 'function_call_output', call_id: 't1', output: '{"rooms":[]}' },
    ]);
    expect(reply.content).toEqual([
      { type: 'text', text: 'ok' },
      { type: 'tool_use', id: 'c9', name: 'get_plan', input: { a: 1 } },
    ]);

    // Remembered: the next request goes straight to /responses.
    await new OpenAiCompatibleProvider('https://x/v1', 'k', 'm-resp', fetcher).send(request);
    expect(calls.map((c) => c.url).slice(2)).toEqual(['https://x/v1/responses']);
  });
});
