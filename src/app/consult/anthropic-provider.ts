import { AiBlock, AiMessage, AiProvider, AiRequest, apiErrorMessage, FetchLike, parseJsonArguments } from './ai-provider';
import { readSse } from './sse';

export const ANTHROPIC_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'];
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

/** A reply block as it is assembled from stream events. */
interface PendingBlock {
  type: string;
  text: string;
  id: string;
  name: string;
  json: string;
}

/** Claude through the Messages API, called straight from the browser with the user's own key. */
export class AnthropicProvider implements AiProvider {
  readonly label: string;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetcher: FetchLike = (url, init) => fetch(url, init),
  ) {
    this.label = `Claude (${model})`;
  }

  async send(req: AiRequest): Promise<AiMessage> {
    const res = await this.fetcher(ENDPOINT, {
      method: 'POST',
      signal: req.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        // Required for calls made from a web page; the key never leaves this browser except to Anthropic.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        stream: true,
        system: req.system,
        tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
        messages: req.messages.map((m) => ({ role: m.role, content: m.content.map(toWire) })),
      }),
    });
    if (!res.ok) throw new Error(await apiErrorMessage(res));

    const blocks = new Map<number, PendingBlock>();
    for await (const { data } of readSse(res)) {
      const e = JSON.parse(data);
      if (e.type === 'error') throw new Error(e.error?.message ?? 'The reply was cut off.');
      if (e.type === 'content_block_start') {
        const b = e.content_block ?? {};
        blocks.set(e.index, { type: b.type, text: '', id: b.id ?? '', name: b.name ?? '', json: '' });
        if (b.type === 'tool_use') req.onEvent?.({ type: 'tool', name: b.name });
      } else if (e.type === 'content_block_delta') {
        const block = blocks.get(e.index);
        if (!block) continue;
        if (e.delta?.type === 'text_delta') {
          block.text += e.delta.text;
          req.onEvent?.({ type: 'text', delta: e.delta.text });
        } else if (e.delta?.type === 'input_json_delta') block.json += e.delta.partial_json;
      }
    }
    const content: AiBlock[] = [...blocks.entries()]
      .sort(([a], [b]) => a - b)
      .flatMap(([, b]): AiBlock[] => {
        if (b.type === 'text') return b.text ? [{ type: 'text', text: b.text }] : [];
        if (b.type === 'tool_use') return [{ type: 'tool_use', id: b.id, name: b.name, input: parseJsonArguments(b.json) }];
        return [];
      });
    return { role: 'assistant', content };
  }
}

function toWire(b: AiBlock): object {
  if (b.type === 'tool_result') return { type: 'tool_result', tool_use_id: b.toolUseId, content: b.content, is_error: b.isError ?? false };
  return b;
}
