import { AiMessage } from './ai-provider';

const REMOVED = '(An earlier screenshot is not shown again; take a new one if you need to look.)';

/**
 * The conversation with screenshots kept only on the most recent tool result that has any, since
 * every request resends the whole history and old pictures would be paid for again at each step.
 */
export function withLatestImagesOnly(history: AiMessage[]): AiMessage[] {
  let latest = -1;
  history.forEach((m, i) => {
    if (m.content.some((b) => b.type === 'tool_result' && b.images?.length)) latest = i;
  });
  return history.map((m, i) => {
    if (i === latest || !m.content.some((b) => b.type === 'tool_result' && b.images?.length)) return m;
    return {
      ...m,
      content: m.content.map((b) => {
        if (b.type !== 'tool_result' || !b.images?.length) return b;
        const { images: _dropped, ...rest } = b;
        return { ...rest, content: `${b.content}\n${REMOVED}` };
      }),
    };
  });
}
