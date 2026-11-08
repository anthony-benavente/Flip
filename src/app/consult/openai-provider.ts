import { AiBlock, AiMessage, AiProvider, AiRequest, apiErrorMessage, FetchLike } from './ai-provider';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Models that refuse tool calls on chat completions and must use the Responses API instead.
 * Learned from the error, so later requests go to the right endpoint straight away.
 */
const RESPONSES_ONLY = new Set<string>();

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
    const message = (await res.json()).choices?.[0]?.message;
    if (!message) throw new Error('The service sent no reply.');
    const content: AiBlock[] = [];
    if (message.content) content.push({ type: 'text', text: message.content });
    for (const call of message.tool_calls ?? []) {
      content.push({ type: 'tool_use', id: call.id, name: call.function?.name, input: parseArguments(call.function?.arguments) });
    }
    return { role: 'assistant', content };
  }

  private async sendResponses(req: AiRequest): Promise<AiMessage> {
    const res = await this.post('responses', req, {
      instructions: req.system,
      input: req.messages.flatMap(toResponseItems),
      tools: req.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.inputSchema })),
    });
    if (!res.ok) throw new Error(await apiErrorMessage(res));
    const content: AiBlock[] = [];
    for (const item of (await res.json()).output ?? []) {
      if (item.type === 'message') {
        const text = (item.content ?? []).flatMap((c: any) => (c.type === 'output_text' ? [c.text] : [])).join('');
        if (text) content.push({ type: 'text', text });
      } else if (item.type === 'function_call') {
        content.push({ type: 'tool_use', id: item.call_id, name: item.name, input: parseArguments(item.arguments) });
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

/** Malformed arguments become `null`, which the command rejects with an error the model can read and fix. */
function parseArguments(raw: unknown): unknown {
  try {
    return JSON.parse(typeof raw === 'string' && raw ? raw : '{}');
  } catch {
    return null;
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
