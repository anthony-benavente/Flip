import { AiBlock, AiMessage, AiProvider, AiRequest, apiErrorMessage, FetchLike, parseJsonArguments } from './ai-provider';
import { readSse } from './sse';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Models that refuse tool calls on chat completions and must use the Responses API instead.
 * Learned from the error, so later requests go to the right endpoint straight away.
 */
const RESPONSES_ONLY = new Set<string>();

/** Models whose Responses API requests were refused when they asked for a reasoning summary (not offered, or the account is not verified). */
const NO_SUMMARY = new Set<string>();

/**
 * Any service that speaks the OpenAI API with tool calls: OpenAI itself, OpenRouter, or a local
 * server such as Ollama or LM Studio (`baseUrl` points at it, and the key may be empty). Uses chat
 * completions, and switches to the Responses API for models that only allow tools there.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly label: string;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetcher: FetchLike = (url, init) => fetch(url, init),
  ) {
    this.label = model;
  }

  async send(req: AiRequest): Promise<AiMessage> {
    if (RESPONSES_ONLY.has(this.model)) return this.sendResponses(req);
    const res = await this.post('chat/completions', req, {
      stream: true,
      messages: [{ role: 'system', content: req.system }, ...req.messages.flatMap(toChatMessages)],
      tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
    });
    if (!res.ok) {
      const message = await apiErrorMessage(res);
      if (res.status === 400 && message.includes('/v1/responses')) {
        RESPONSES_ONLY.add(this.model);
        return this.sendResponses(req);
      }
      throw new Error(message);
    }

    let text = '';
    const calls = new Map<number, { id: string; name: string; args: string }>();
    for await (const { data } of readSse(res)) {
      if (data === '[DONE]') break;
      const chunk = JSON.parse(data);
      if (chunk.error) throw new Error(chunk.error.message ?? 'The reply was cut off.');
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      // Some servers (DeepSeek and others) stream their reasoning as it happens.
      const thought = delta.reasoning_content ?? delta.reasoning;
      if (typeof thought === 'string' && thought) req.onEvent?.({ type: 'thinking', delta: thought });
      if (delta.content) {
        text += delta.content;
        req.onEvent?.({ type: 'text', delta: delta.content });
      }
      for (const t of delta.tool_calls ?? []) {
        const call = calls.get(t.index ?? 0) ?? { id: '', name: '', args: '' };
        calls.set(t.index ?? 0, call);
        if (t.id) call.id = t.id;
        if (t.function?.name) {
          if (!call.name) req.onEvent?.({ type: 'tool', name: t.function.name });
          call.name += t.function.name;
        }
        call.args += t.function?.arguments ?? '';
      }
    }
    const content: AiBlock[] = text ? [{ type: 'text', text }] : [];
    for (const [index, call] of [...calls.entries()].sort(([a], [b]) => a - b)) {
      content.push({ type: 'tool_use', id: call.id || `call_${index}`, name: call.name, input: parseJsonArguments(call.args) });
    }
    return { role: 'assistant', content };
  }

  private async sendResponses(req: AiRequest): Promise<AiMessage> {
    const res = await this.post('responses', req, {
      stream: true,
      instructions: req.system,
      input: req.messages.flatMap(toResponseItems),
      tools: req.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.inputSchema })),
      // Ask for a summary of the model's reasoning, which is the only view of it the service gives.
      ...(!NO_SUMMARY.has(this.model) && { reasoning: { summary: 'auto' } }),
    });
    if (!res.ok) {
      const message = await apiErrorMessage(res);
      if (res.status === 400 && /reasoning/i.test(message) && !NO_SUMMARY.has(this.model)) {
        NO_SUMMARY.add(this.model);
        return this.sendResponses(req);
      }
      throw new Error(message);
    }

    let output: any[] | null = null;
    let summaryParts = 0;
    for await (const { data } of readSse(res)) {
      const e = JSON.parse(data);
      switch (e.type) {
        case 'response.output_text.delta':
          req.onEvent?.({ type: 'text', delta: e.delta });
          break;
        case 'response.reasoning_summary_part.added':
          // Separate one summary paragraph from the next.
          if (summaryParts++) req.onEvent?.({ type: 'thinking', delta: '\n\n' });
          break;
        case 'response.reasoning_summary_text.delta':
          req.onEvent?.({ type: 'thinking', delta: e.delta });
          break;
        case 'response.output_item.added':
          if (e.item?.type === 'function_call') req.onEvent?.({ type: 'tool', name: e.item.name });
          break;
        case 'response.completed':
        case 'response.incomplete':
          output = e.response?.output ?? [];
          break;
        case 'response.failed':
          throw new Error(e.response?.error?.message ?? 'The reply failed.');
        case 'error':
          throw new Error(e.message ?? e.error?.message ?? 'The reply failed.');
      }
    }
    if (!output) throw new Error('The reply ended early.');
    const content: AiBlock[] = [];
    for (const item of output) {
      if (item.type === 'message') {
        const text = (item.content ?? []).flatMap((c: any) => (c.type === 'output_text' ? [c.text] : [])).join('');
        if (text) content.push({ type: 'text', text });
      } else if (item.type === 'function_call') {
        content.push({ type: 'tool_use', id: item.call_id, name: item.name, input: parseJsonArguments(item.arguments) });
      }
    }
    return { role: 'assistant', content };
  }

  private post(path: string, req: AiRequest, body: object): Promise<Response> {
    return this.fetcher(`${this.baseUrl.replace(/\/+$/, '')}/${path}`, {
      method: 'POST',
      signal: req.signal,
      headers: { 'content-type': 'application/json', ...(this.apiKey && { authorization: `Bearer ${this.apiKey}` }) },
      body: JSON.stringify({ model: this.model, ...body }),
    });
  }
}

const textOf = (m: AiMessage) => m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');

function toChatMessages(m: AiMessage): object[] {
  const text = textOf(m);
  if (m.role === 'assistant') {
    const calls = m.content.flatMap((b) =>
      b.type === 'tool_use' ? [{ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }] : [],
    );
    return [{ role: 'assistant', content: text || null, ...(calls.length && { tool_calls: calls }) }];
  }
  const results = m.content.flatMap((b) => (b.type === 'tool_result' ? [{ role: 'tool', tool_call_id: b.toolUseId, content: b.content }] : []));
  return [...results, ...(text ? [{ role: 'user', content: text }] : [])];
}

function toResponseItems(m: AiMessage): object[] {
  const text = textOf(m);
  if (m.role === 'assistant') {
    const calls = m.content.flatMap((b) =>
      b.type === 'tool_use' ? [{ type: 'function_call', call_id: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) }] : [],
    );
    return [...(text ? [{ role: 'assistant', content: text }] : []), ...calls];
  }
  const results = m.content.flatMap((b) => (b.type === 'tool_result' ? [{ type: 'function_call_output', call_id: b.toolUseId, output: b.content }] : []));
  return [...results, ...(text ? [{ role: 'user', content: text }] : [])];
}
