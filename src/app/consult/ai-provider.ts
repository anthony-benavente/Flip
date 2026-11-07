/**
 * What the consult session needs from an AI service. A provider turns these neutral messages into
 * its own wire format, so adding another service means adding one class that implements this.
 */
export interface AiToolSpec {
  name: string;
  description: string;
  /** A JSON Schema object. */
  inputSchema: object;
}

export type AiBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean };

export interface AiMessage {
  role: 'user' | 'assistant';
  content: AiBlock[];
}

export interface AiRequest {
  system: string;
  messages: AiMessage[];
  tools: AiToolSpec[];
  signal?: AbortSignal;
}

export interface AiProvider {
  /** Shown to the user, such as "Claude (claude-sonnet-5-5)". */
  readonly label: string;
  /** Sends the conversation and resolves with the assistant's next message. Rejects with a readable message on failure. */
  send(request: AiRequest): Promise<AiMessage>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** The error text an API put in a failed response, falling back to the status line. */
export async function apiErrorMessage(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.message ?? '';
  } catch {
    // Not JSON; the status line will do.
  }
  return `${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`.trim();
}
