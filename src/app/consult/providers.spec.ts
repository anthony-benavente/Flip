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

  it('retries with reasoning off when the model refuses tools while reasoning', async () => {
    const calls: any[] = [];
    const fetcher = async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      calls.push(body);
      return body.reasoning_effort
        ? new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
        : new Response(JSON.stringify({ error: { message: "Function tools with reasoning_effort are not supported for m-reason in /v1/chat/completions. Set reasoning_effort to 'none'." } }), { status: 400, statusText: 'Bad Request' });
    };
    const provider = new OpenAiCompatibleProvider('https://x/v1', 'k', 'm-reason', fetcher);
    expect((await provider.send(request)).content).toEqual([{ type: 'text', text: 'ok' }]);
    expect(calls.map((c) => c.reasoning_effort)).toEqual([undefined, 'none']);

    // Remembered for later requests, even from a new provider object.
    await new OpenAiCompatibleProvider('https://x/v1', 'k', 'm-reason', fetcher).send(request);
    expect(calls.map((c) => c.reasoning_effort)).toEqual([undefined, 'none', 'none']);
  });
});
