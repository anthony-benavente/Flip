import { AiBlock, AiMessage, AiProvider, AiRequest, apiErrorMessage, FetchLike } from './ai-provider';

export const ANTHROPIC_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'];
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

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
        system: req.system,
        tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
        messages: req.messages.map((m) => ({ role: m.role, content: m.content.map(toWire) })),
      }),
    });
    if (!res.ok) throw new Error(await apiErrorMessage(res));
    const body = await res.json();
    const content: AiBlock[] = (body.content ?? []).flatMap((b: any): AiBlock[] => {
      if (b.type === 'text') return [{ type: 'text', text: b.text }];
      if (b.type === 'tool_use') return [{ type: 'tool_use', id: b.id, name: b.name, input: b.input }];
      return [];
    });
    return { role: 'assistant', content };
  }
}

function toWire(b: AiBlock): object {
  if (b.type === 'tool_result') return { type: 'tool_result', tool_use_id: b.toolUseId, content: b.content, is_error: b.isError ?? false };
  return b;
}
