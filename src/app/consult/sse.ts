export interface SseMessage {
  event: string;
  data: string;
}

/** Reads a server-sent events response, yielding each event as it arrives. */
export async function* readSse(res: Response): AsyncGenerator<SseMessage> {
  if (!res.body) throw new Error('The service sent no stream.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
      for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
        const message = parseEvent(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (message) yield message;
      }
      if (done) break;
    }
    const rest = parseEvent(buffer);
    if (rest) yield rest;
  } finally {
    reader.cancel().catch(() => {});
  }
}

function parseEvent(block: string): SseMessage | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  return data.length ? { event, data: data.join('\n') } : null;
}
