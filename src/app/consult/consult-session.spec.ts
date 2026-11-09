import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { createEmptyPlan } from '../model/defaults';
import { ImageLibrary } from '../persistence/image-library';
import { ModelLibrary } from '../persistence/model-library';
import { PlanStore } from '../state/plan.store';
import { AiMessage, AiProvider, AiRequest, AiStreamEvent } from './ai-provider';
import { AiSettings } from './ai-settings';
import { ConsultSession, MAX_STEPS } from './consult-session';

const say = (text: string): AiMessage => ({ role: 'assistant', content: [{ type: 'text', text }] });
const call = (id: string, name: string, input: unknown = {}): AiMessage => ({ role: 'assistant', content: [{ type: 'tool_use', id, name, input }] });

/** A provider that plays back replies and records what it was asked. */
function script(...replies: (AiMessage | Error)[]): AiProvider & { requests: AiRequest[] } {
  const requests: AiRequest[] = [];
  return {
    label: 'script',
    requests,
    async send(req) {
      requests.push({ ...req, messages: structuredClone(req.messages) });
      const next = replies.shift();
      if (!next) throw new Error('script ran out');
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const chairModel = { id: 'm1', name: 'Aeron', catalogId: 'office-chair', fileName: 'a.glb', byteSize: 1, createdAt: '', orientation: { x: 0, y: 0, z: 0 } } as const;

function setup(provider: AiProvider | null) {
  TestBed.configureTestingModule({
    providers: [
      ConsultSession,
      { provide: AiSettings, useValue: { createProvider: () => provider } },
      { provide: ModelLibrary, useValue: { models: signal([chairModel]).asReadonly() } },
      { provide: ImageLibrary, useValue: { images: signal([]).asReadonly() } },
    ],
  });
  const plan = TestBed.inject(PlanStore);
  plan.load(createEmptyPlan());
  return { plan, session: TestBed.inject(ConsultSession) };
}

const room = { x: 0, y: 0, width: 400, depth: 300, name: 'Den' };

describe('ConsultSession', () => {
  afterEach(() => delete (window as { flip?: unknown }).flip);

  it('runs the AI\'s commands and keeps all of them as one undo step', async () => {
    const provider = script(call('1', 'add_room', room), call('2', 'place_furniture', { catalogId: 'sofa-3', x: 200, y: 150, rotation: 0 }), say('Done.'));
    const { plan, session } = setup(provider);
    await session.send('Make a den');

    expect(plan.plan().walls).toHaveLength(4);
    expect(plan.plan().furniture).toHaveLength(1);
    expect(session.proposal()?.summaries).toHaveLength(2);
    expect(session.entries().map((e) => e.kind)).toEqual(['user', 'action', 'action', 'assistant']);

    plan.undo();
    expect(plan.plan().walls).toHaveLength(0);
    expect(plan.canUndo()).toBe(false);
  });

  it('sends results back, including errors the AI can fix', async () => {
    const provider = script(call('1', 'place_furniture', { catalogId: 'nope', x: 0, y: 0 }), say('ok'));
    const { plan, session } = setup(provider);
    await session.send('Add something');

    expect(plan.plan().furniture).toHaveLength(0);
    expect(session.proposal()).toBeNull();
    const result = provider.requests[1].messages.at(-1)!.content[0];
    expect(result).toMatchObject({ type: 'tool_result', toolUseId: '1', isError: true });
    expect((result as { content: string }).content).toContain('catalogId');
  });

  it('discards a proposal with one undo, and not after the plan was edited', async () => {
    const { plan, session } = setup(script(call('1', 'add_room', room), say('x'), call('2', 'add_room', { ...room, x: 600 }), say('y')));
    await session.send('one');
    expect(session.canDiscard()).toBe(true);
    session.discard();
    expect(plan.plan().walls).toHaveLength(0);
    expect(session.proposal()).toBeNull();

    await session.send('two');
    plan.update((d) => void (d.name = 'Edited'));
    expect(session.canDiscard()).toBe(false);
    session.discard();
    expect(plan.plan().walls).toHaveLength(4);
    session.keep();
    expect(session.proposal()).toBeNull();
  });

  it('does not create a proposal for reading commands', async () => {
    const { plan, session } = setup(script(call('1', 'get_plan'), say('Looks empty.')));
    await session.send('Look');
    expect(session.proposal()).toBeNull();
    expect(plan.canUndo()).toBe(false);
  });

  it('shows provider failures and can try again', async () => {
    const { session } = setup(script(new Error('401 Unauthorized'), say('hi')));
    await session.send('hello');
    expect(session.entries().at(-1)).toEqual({ kind: 'error', text: '401 Unauthorized' });
    expect(session.busy()).toBe(false);
    await session.send('again');
    expect(session.entries().at(-1)).toEqual({ kind: 'assistant', text: 'hi' });
  });

  it('answers tool calls left open by a failed request so the next request is valid', async () => {
    const provider = script(call('1', 'get_plan'), new Error('network'), say('back'));
    const { session } = setup(provider);
    await session.send('first');
    await session.send('second');
    const history = provider.requests[2].messages;
    const answered = history.find((m) => m.content.some((b) => b.type === 'tool_result'));
    expect(answered).toBeTruthy();
  });

  it('stops a model that never finishes', async () => {
    const forever = script(...Array.from({ length: MAX_STEPS + 1 }, (_, i) => call(`${i}`, 'get_plan')));
    const { session } = setup(forever);
    await session.send('loop');
    expect(forever.requests).toHaveLength(MAX_STEPS);
    expect(session.entries().at(-1)!.text).toContain('Stopped after');
  });

  it('asks for settings when there is no provider', async () => {
    const { session } = setup(null);
    await session.send('hello');
    expect(session.entries()).toEqual([{ kind: 'error', text: expect.stringContaining('API key') }]);
  });

  it('exposes the same commands on window.flip', () => {
    const { plan } = setup(null);
    const flip = (window as unknown as { flip: any }).flip;
    expect(flip.commands().map((c: { name: string }) => c.name)).toContain('add_room');
    const results = flip.runBatch([{ name: 'add_room', args: room }, { name: 'nope' }]);
    expect(results.map((r: { ok: boolean }) => r.ok)).toEqual([true, false]);
    expect(plan.plan().walls).toHaveLength(4);
    expect(flip.run('get_plan').ok).toBe(true);
  });

  it('lets commands use the user\'s uploaded models', async () => {
    const provider = script(
      call('1', 'place_furniture', { catalogId: 'office-chair', x: 100, y: 100, rotation: 0, modelId: 'm1' }),
      say('Done.'),
    );
    const { plan, session } = setup(provider);
    await session.send('Use my chair');
    expect(plan.plan().furniture[0].modelId).toBe('m1');
    expect(session.execute({ name: 'list_uploads' })).toMatchObject({ ok: true, output: { models: [{ modelId: 'm1', templateName: 'Office chair' }] } });
  });

  describe('live progress', () => {
    /** A provider that streams `events` before each reply, and records the status while it waits. */
    function streaming(reply: AiMessage, events: AiStreamEvent[], statuses: string[], session: () => ConsultSession): AiProvider {
      return {
        label: 'stream',
        async send(req) {
          statuses.push(session().status());
          for (const e of events) {
            req.onEvent?.(e);
            statuses.push(session().status());
          }
          return reply;
        },
      };
    }

    it('shows thinking and reply text as they stream, without repeating them when the reply ends', async () => {
      const statuses: string[] = [];
      let session!: ConsultSession;
      const provider = streaming(
        say('Hello there.'),
        [
          { type: 'thinking', delta: 'Planning ' },
          { type: 'thinking', delta: 'a layout.' },
          { type: 'text', delta: 'Hello ' },
          { type: 'text', delta: 'there.' },
        ],
        statuses,
        () => session,
      );
      ({ session } = setup(provider));
      await session.send('hi');

      expect(session.entries()).toEqual([
        { kind: 'user', text: 'hi' },
        { kind: 'thinking', text: 'Planning a layout.' },
        { kind: 'assistant', text: 'Hello there.' },
      ]);
      expect(session.status()).toBe('');
      expect(session.busy()).toBe(false);
    });

    it('reports what the AI is doing, step by step', async () => {
      const statuses: string[] = [];
      let session!: ConsultSession;
      const first = streaming(call('1', 'get_plan'), [{ type: 'tool', name: 'get_plan' }], statuses, () => session);
      const second = streaming(say('Done.'), [], statuses, () => session);
      const replies = [first, second];
      ({ session } = setup({ label: 'two', send: (req) => replies.shift()!.send(req) }));
      await session.send('look');
      expect(statuses).toEqual(['Asking the model…', 'Writing get_plan…', 'Asking the model… (step 2)']);
    });

    it('keeps a streamed reply as text when the provider does not stream', async () => {
      const { session } = setup(script(say('Plain reply.')));
      await session.send('hi');
      expect(session.entries().at(-1)).toEqual({ kind: 'assistant', text: 'Plain reply.' });
    });
  });
});
