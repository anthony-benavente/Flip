import { AiMessage } from './ai-provider';
import { withLatestImagesOnly } from './history';

const shot = (id: string): AiMessage => ({
  role: 'user',
  content: [{ type: 'tool_result', toolUseId: id, content: `shot ${id}`, images: [{ mediaType: 'image/jpeg', data: id }] }],
});
const text = (t: string): AiMessage => ({ role: 'user', content: [{ type: 'text', text: t }] });

describe('withLatestImagesOnly', () => {
  it('keeps only the latest screenshot and says the earlier ones were dropped', () => {
    const history = [text('hi'), shot('a'), text('more'), shot('b'), shot('c')];
    const out = withLatestImagesOnly(history);
    const images = out.flatMap((m) => m.content.flatMap((b) => (b.type === 'tool_result' ? (b.images ?? []) : [])));
    expect(images).toEqual([{ mediaType: 'image/jpeg', data: 'c' }]);
    const dropped = out[1].content[0] as { content: string; images?: unknown };
    expect(dropped.images).toBeUndefined();
    expect(dropped.content).toContain('shot a');
    expect(dropped.content).toContain('not shown again');
  });

  it('leaves the history alone when there is nothing to drop, and never changes the original', () => {
    const history = [text('hi'), shot('a')];
    expect(withLatestImagesOnly(history)).toEqual(history);
    const longer = [shot('a'), shot('b')];
    withLatestImagesOnly(longer);
    expect((longer[0].content[0] as { images?: unknown[] }).images).toHaveLength(1);
  });
});
