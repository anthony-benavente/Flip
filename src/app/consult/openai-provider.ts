import { AiBlock, AiMessage, AiProvider, AiRequest, apiErrorMessage, FetchLike } from './ai-provider';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Any service that speaks the OpenAI chat completions format with tool calls: OpenAI itself,
 * OpenRouter, or a local server such as Ollama or LM Studio (`baseUrl` points at it, and the key may be empty).
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
    const res = await this.fetcher(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: req.signal,
      headers: { 'content-type': 'application/json', ...(this.apiKey && { authorization: `Bearer ${this.apiKey}` }) },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: req.system }, ...req.messages.flatMap(toWire)],
        tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
      }),
    });
    if (!res.ok) throw new Error(await apiErrorMessage(res));
    const message = (await res.json()).choices?.[0]?.message;
    if (!message) throw new Error('The service sent no reply.');
    const content: AiBlock[] = [];
    if (message.content) content.push({ type: 'text', text: message.content });
    for (const call of message.tool_calls ?? []) {
      let input: unknown = {};
      try {
        input = JSON.parse(call.function?.arguments || '{}');
      } catch {
        // Malformed arguments reach the command as-is and come back as a validation error the model can fix.
        input = null;
      }
      content.push({ type: 'tool_use', id: call.id, name: call.function?.name, input });
    }
    return { role: 'assistant', content };
  }
}

function toWire(m: AiMessage): object[] {
  const text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
  if (m.role === 'assistant') {
    const calls = m.content.flatMap((b) =>
      b.type === 'tool_use' ? [{ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }] : [],
    );
    return [{ role: 'assistant', content: text || null, ...(calls.length && { tool_calls: calls }) }];
  }
  const results = m.content.flatMap((b) => (b.type === 'tool_result' ? [{ role: 'tool', tool_call_id: b.toolUseId, content: b.content }] : []));
  return [...results, ...(text ? [{ role: 'user', content: text }] : [])];
}
