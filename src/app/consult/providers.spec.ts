import { AiMessage, AiRequest, AiStreamEvent } from './ai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { OpenAiCompatibleProvider } from './openai-provider';
import { readSse } from './sse';

const request: AiRequest = {
  system: 'be helpful',
  tools: [{ name: 'get_plan', description: 'reads', inputSchema: { type: 'object', properties: {} } }],
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'looking' }, { type: 'tool_use', id: 't1', name: 'get_plan', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: '{"rooms":[]}' }] },
  ],
};

/** A server-sent events body from `[event name, payload]` pairs; the payload is JSON unless it is a string. */
function sse(...events: [string, unknown][]): string {
  return events.map(([event, data]) => `event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`).join('');
}

function respond(body: string | object, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, statusText: status === 200 ? 'OK' : 'Bad' });
  };
  return { fetcher, calls, sent: (i = 0) => JSON.parse(calls[i].init.body as string) };
}

/** Collects the events a provider reports while it streams. */
function watch(): { events: AiStreamEvent[]; req: AiRequest } {
  const events: AiStreamEvent[] = [];
  return { events, req: { ...request, onEvent: (e) => events.push(e) } };
}

describe('readSse', () => {
  it('reads events split across chunks, with CRLF line ends', async () => {
    const encoder = new TextEncoder();
    const parts = ['event: a\r\ndata: {"x"', ':1}\r\n\r\ndata: one\ndata: two\n\n', 'event: tail\ndata: end'];
    const body = new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(encoder.encode(p));
        c.close();
      },
    });
    const got = [];
    for await (const m of readSse(new Response(body))) got.push(m);
    expect(got).toEqual([
      { event: 'a', data: '{"x":1}' },
      { event: 'message', data: 'one\ntwo' },
      { event: 'tail', data: 'end' },
    ]);
  });
});

describe('AnthropicProvider', () => {
  it('streams text and tool calls, and sends tools and messages in Messages API form', async () => {
    const api = respond(
      sse(
        ['message_start', { type: 'message_start' }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Look' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ing.' } }],
        ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'u1', name: 'get_plan', input: {} } }],
        ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"a"' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: ':1}' } }],
        ['message_stop', { type: 'message_stop' }],
      ),
    );
    const { events, req } = watch();
    const reply = await new AnthropicProvider('sk-test', 'claude-sonnet-5-5', api.fetcher).send(req);

    expect(api.calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    const headers = api.calls[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = api.sent();
    expect(body).toMatchObject({ model: 'claude-sonnet-5-5', system: 'be helpful', stream: true });
    expect(body.tools[0]).toMatchObject({ name: 'get_plan', input_schema: { type: 'object' } });
    expect(body.messages[2].content[0]).toEqual({ type: 'tool_result', tool_use_id: 't1', content: '{"rooms":[]}', is_error: false });
    expect(events).toEqual([
      { type: 'text', delta: 'Look' },
      { type: 'text', delta: 'ing.' },
      { type: 'tool', name: 'get_plan' },
    ]);
    expect(reply.content).toEqual([
      { type: 'text', text: 'Looking.' },
      { type: 'tool_use', id: 'u1', name: 'get_plan', input: { a: 1 } },
    ]);
  });

  it('sends a screenshot inside the tool result', async () => {
    const api = respond(sse(['message_stop', { type: 'message_stop' }]));
    const withImage: AiRequest = {
      ...request,
      messages: [...request.messages.slice(0, 2), { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: 'a screenshot', images: [{ mediaType: 'image/jpeg', data: 'QUJD' }] }] }],
    };
    await new AnthropicProvider('k', 'm', api.fetcher).send(withImage);
    expect(api.sent().messages[2].content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 't1',
      content: [{ type: 'text', text: 'a screenshot' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }],
      is_error: false,
    });
  });

  it('turns an API error into a readable message', async () => {
    const api = respond({ error: { message: 'invalid x-api-key' } }, 401);
    await expect(new AnthropicProvider('bad', 'm', api.fetcher).send(request)).rejects.toThrow('401 Bad: invalid x-api-key');
  });

  it('reports an error that arrives mid-stream', async () => {
    const api = respond(sse(['error', { type: 'error', error: { message: 'Overloaded' } }]));
    await expect(new AnthropicProvider('k', 'm', api.fetcher).send(request)).rejects.toThrow('Overloaded');
  });
});

describe('OpenAiCompatibleProvider', () => {
  const chunk = (delta: object) => ['message', { choices: [{ delta }] }] as [string, unknown];

  it('streams chat completions and maps messages, tools and tool results', async () => {
    const api = respond(
      sse(
        chunk({ content: 'Look' }),
        chunk({ content: 'ing.' }),
        chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'get_plan', arguments: '' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '{"a"' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: ':1}' } }] }),
        ['message', '[DONE]'],
      ),
    );
    const { events, req } = watch();
    const reply: AiMessage = await new OpenAiCompatibleProvider('http://localhost:11434/v1/', '', 'llama', api.fetcher).send(req);

    expect(api.calls[0].url).toBe('http://localhost:11434/v1/chat/completions');
    expect((api.calls[0].init.headers as Record<string, string>)['authorization']).toBeUndefined();
    const body = api.sent();
    expect(body.stream).toBe(true);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'be helpful' });
    expect(body.tools[0].function).toMatchObject({ name: 'get_plan', parameters: { type: 'object' } });
    expect(body.messages[2]).toMatchObject({ role: 'assistant', content: 'looking', tool_calls: [{ id: 't1', function: { name: 'get_plan', arguments: '{}' } }] });
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: '{"rooms":[]}' });
    expect(events).toEqual([
      { type: 'text', delta: 'Look' },
      { type: 'text', delta: 'ing.' },
      { type: 'tool', name: 'get_plan' },
    ]);
    expect(reply.content).toEqual([
      { type: 'text', text: 'Looking.' },
      { type: 'tool_use', id: 'c1', name: 'get_plan', input: { a: 1 } },
    ]);
  });

  it('shows reasoning that a server streams alongside its reply', async () => {
    const api = respond(sse(chunk({ reasoning_content: 'Hmm' }), chunk({ content: 'Hi' }), ['message', '[DONE]']));
    const { events, req } = watch();
    await new OpenAiCompatibleProvider('https://x/v1', '', 'deepseek', api.fetcher).send(req);
    expect(events).toEqual([
      { type: 'thinking', delta: 'Hmm' },
      { type: 'text', delta: 'Hi' },
    ]);
  });

  it('shows a screenshot to the model in a user message after the tool result', async () => {
    const api = respond(sse(chunk({ content: 'ok' }), ['message', '[DONE]']));
    const withImage: AiRequest = {
      ...request,
      messages: [...request.messages.slice(0, 2), { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: 'a screenshot', images: [{ mediaType: 'image/jpeg', data: 'QUJD' }] }] }],
    };
    await new OpenAiCompatibleProvider('https://x/v1', '', 'm', api.fetcher).send(withImage);
    const sent = api.sent().messages;
    expect(sent[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: 'a screenshot' });
    expect(sent[4]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'Screenshot from the tool call above:' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }],
    });
  });

  it('sends the key as a bearer token', async () => {
    const api = respond(sse(chunk({ content: 'hi' }), ['message', '[DONE]']));
    await new OpenAiCompatibleProvider('https://x/v1', 'sk-1', 'm', api.fetcher).send(request);
    expect((api.calls[0].init.headers as Record<string, string>)['authorization']).toBe('Bearer sk-1');
  });

  describe('Responses API', () => {
    const refusal = new Response(
      JSON.stringify({ error: { message: 'Function tools with reasoning_effort are not supported for m in /v1/chat/completions. To use function tools, use /v1/responses.' } }),
      { status: 400, statusText: 'Bad Request' },
    );
    const completed = (output: unknown[]): [string, unknown] => ['response.completed', { type: 'response.completed', response: { output } }];

    it('switches to it for a model that only allows tools there, and streams reasoning summaries', async () => {
      const calls: { url: string; body: any }[] = [];
      const stream = sse(
        ['response.reasoning_summary_part.added', { type: 'response.reasoning_summary_part.added' }],
        ['response.reasoning_summary_text.delta', { type: 'response.reasoning_summary_text.delta', delta: 'Checking the room.' }],
        ['response.reasoning_summary_part.added', { type: 'response.reasoning_summary_part.added' }],
        ['response.reasoning_summary_text.delta', { type: 'response.reasoning_summary_text.delta', delta: 'Placing a sofa.' }],
        ['response.output_text.delta', { type: 'response.output_text.delta', delta: 'ok' }],
        ['response.output_item.added', { type: 'response.output_item.added', item: { type: 'function_call', name: 'get_plan' } }],
        completed([
          { type: 'reasoning', summary: [] },
          { type: 'message', content: [{ type: 'output_text', text: 'ok' }] },
          { type: 'function_call', call_id: 'c9', name: 'get_plan', arguments: '{"a":1}' },
        ]),
      );
      const fetcher = async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(init.body as string) });
        return url.endsWith('/chat/completions') ? refusal.clone() : new Response(stream, { status: 200 });
      };
      const { events, req } = watch();
      const reply = await new OpenAiCompatibleProvider('https://x/v1', 'k', 'm-resp', fetcher).send(req);

      expect(calls.map((c) => c.url)).toEqual(['https://x/v1/chat/completions', 'https://x/v1/responses']);
      const sent = calls[1].body;
      expect(sent).toMatchObject({ model: 'm-resp', instructions: 'be helpful', stream: true, reasoning: { summary: 'auto' } });
      expect(sent.tools[0]).toMatchObject({ type: 'function', name: 'get_plan', parameters: { type: 'object' } });
      expect(sent.input).toEqual([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'looking' },
        { type: 'function_call', call_id: 't1', name: 'get_plan', arguments: '{}' },
        { type: 'function_call_output', call_id: 't1', output: '{"rooms":[]}' },
      ]);
      expect(events).toEqual([
        { type: 'thinking', delta: 'Checking the room.' },
        { type: 'thinking', delta: '\n\n' },
        { type: 'thinking', delta: 'Placing a sofa.' },
        { type: 'text', delta: 'ok' },
        { type: 'tool', name: 'get_plan' },
      ]);
      expect(reply.content).toEqual([
        { type: 'text', text: 'ok' },
        { type: 'tool_use', id: 'c9', name: 'get_plan', input: { a: 1 } },
      ]);

      // Remembered: the next request goes straight to /responses.
      await new OpenAiCompatibleProvider('https://x/v1', 'k', 'm-resp', async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body as string) });
        return new Response(stream);
      }).send(request);
      expect(calls.map((c) => c.url).slice(2)).toEqual(['https://x/v1/responses']);
    });

    it('shows a screenshot as an input image after the tool output', async () => {
      const bodies: any[] = [];
      const fetcher = async (url: string, init: RequestInit) => {
        if (url.endsWith('/chat/completions')) return refusal.clone();
        bodies.push(JSON.parse(init.body as string));
        return new Response(sse(completed([])));
      };
      const withImage: AiRequest = {
        ...request,
        messages: [...request.messages.slice(0, 2), { role: 'user', content: [{ type: 'tool_result', toolUseId: 't1', content: 'a screenshot', images: [{ mediaType: 'image/jpeg', data: 'QUJD' }] }] }],
      };
      await new OpenAiCompatibleProvider('https://x/v1', 'k', 'm-img', fetcher).send(withImage);
      expect(bodies[0].input.slice(-2)).toEqual([
        { type: 'function_call_output', call_id: 't1', output: 'a screenshot' },
        { role: 'user', content: [{ type: 'input_text', text: 'Screenshot from the tool call above:' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,QUJD' }] },
      ]);
    });

    it('asks again without a reasoning summary when the account or model refuses one', async () => {
      const sent: any[] = [];
      const fetcher = async (url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        sent.push(body.reasoning);
        if (url.endsWith('/chat/completions')) return refusal.clone();
        return body.reasoning
          ? new Response(JSON.stringify({ error: { message: 'Your organization must be verified to generate reasoning summaries.' } }), { status: 400, statusText: 'Bad Request' })
          : new Response(sse(completed([{ type: 'message', content: [{ type: 'output_text', text: 'fine' }] }])));
      };
      const reply = await new OpenAiCompatibleProvider('https://x/v1', 'k', 'm-nosum', fetcher).send(request);
      expect(sent).toEqual([undefined, { summary: 'auto' }, undefined]);
      expect(reply.content).toEqual([{ type: 'text', text: 'fine' }]);
    });

    it('reports a failed response', async () => {
      const fetcher = async (url: string) =>
        url.endsWith('/chat/completions')
          ? refusal.clone()
          : new Response(sse(['response.failed', { type: 'response.failed', response: { error: { message: 'The server had an error' } } }]));
      await expect(new OpenAiCompatibleProvider('https://x/v1', 'k', 'm-fail', fetcher).send(request)).rejects.toThrow('The server had an error');
    });
  });
});
