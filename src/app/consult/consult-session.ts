import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { CommandCall, CommandContext, CommandResult } from '../commands/command';
import { commandSpecs, isReadOnlyCommand, runCommand } from '../commands/run-command';
import { validate } from '../commands/schema';
import { newId } from '../model/plan.model';
import { ImageLibrary } from '../persistence/image-library';
import { ModelLibrary } from '../persistence/model-library';
import { PlanStore } from '../state/plan.store';
import { AiBlock, AiMessage, AiStreamEvent, AiToolSpec } from './ai-provider';
import { AiSettings } from './ai-settings';
import { withLatestImagesOnly } from './history';
import { PLAN_SNAPSHOT, SNAPSHOT_SIZE, SnapshotView, VIEW_PLAN_NAME, viewPlanTool } from './snapshot';
import { SYSTEM_PROMPT } from './system-prompt';
import { installWindowApi } from './window-api';

/** The most model round trips one message may take, so a confused model cannot loop forever. */
export const MAX_STEPS = 25;
/** Largest tool result sent back to the model (characters). */
const MAX_RESULT_CHARS = 60_000;

export interface ChatEntry {
  /** `thinking` is a summary of the model's reasoning, when the service provides one. */
  kind: 'user' | 'assistant' | 'thinking' | 'action' | 'error';
  text: string;
  /** A screenshot the AI looked at, as a data URL. */
  image?: string;
}

/** Changes made since the user last kept or discarded: they are already in the plan, as one undo step. */
export interface Proposal {
  summaries: string[];
  /** The plan's revision right after the latest change; if the plan has moved on, discarding is no longer a clean undo. */
  revision: number;
}

class Rejected extends Error {}

/**
 * One consulting conversation about the open plan. AI replies call commands; edits are applied to
 * the plan as a single undo step and listed as a proposal that the user keeps or discards.
 * Provided by the editor page, so a new plan starts a fresh conversation.
 */
@Injectable()
export class ConsultSession {
  private readonly plan = inject(PlanStore);
  private readonly settings = inject(AiSettings);
  private readonly modelLibrary = inject(ModelLibrary);
  private readonly imageLibrary = inject(ImageLibrary);
  private readonly snapshotter = inject(PLAN_SNAPSHOT);

  readonly entries = signal<ChatEntry[]>([]);
  readonly busy = signal(false);
  /** What the AI is doing right now, such as "Asking the model… (step 2)"; empty when idle. */
  readonly status = signal('');
  /** Seconds since the message was sent. */
  readonly elapsed = signal(0);
  readonly proposal = signal<Proposal | null>(null);
  /** Discarding undoes cleanly only while nothing else has edited the plan since the proposal. */
  readonly canDiscard = computed(() => {
    const p = this.proposal();
    return !!p && p.revision === this.plan.revision();
  });

  private history: AiMessage[] = [];
  private abort: AbortController | null = null;
  /** Index in `entries` of the thinking and reply text still streaming in for the current step. */
  private live: Partial<Record<'assistant' | 'thinking', number>> = {};
  /** Coalesces every change of one proposal into one undo step. */
  private editKey: string | null = null;

  constructor() {
    const remove = installWindowApi(this);
    inject(DestroyRef).onDestroy(() => {
      this.abort?.abort();
      remove();
    });
  }

  /**
   * Runs a command on the open plan. Edits join the current proposal; reading commands do not touch the plan.
   * This is the one entry point for every AI, the chat below and `window.flip` alike.
   */
  execute(call: CommandCall): CommandResult {
    const ctx = this.context();
    if (isReadOnlyCommand(call.name)) return runCommand(structuredClone(this.plan.plan()), call, ctx);
    const key = (this.editKey ??= `ai-${newId()}`);
    let result: CommandResult = { ok: false, error: 'The command did not run.' };
    try {
      this.plan.update(
        (draft) => {
          result = runCommand(draft, call, ctx);
          // Throwing discards the draft, so a refused command changes nothing.
          if (!result.ok) throw new Rejected();
        },
        { coalesceKey: key },
      );
    } catch (e) {
      if (!(e instanceof Rejected)) result = { ok: false, error: `The command failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (result.ok) {
      const { summary } = result;
      this.proposal.update((p) => ({ summaries: [...(p?.summaries ?? []), summary], revision: this.plan.revision() }));
    }
    return result;
  }

  /** The user's uploaded models and pictures, which some commands use. */
  private context(): CommandContext {
    return { models: this.modelLibrary.models(), images: this.imageLibrary.images() };
  }

  /** Accepts the proposal; the changes stay and the next edit starts a new undo step. */
  keep(): void {
    this.plan.commit();
    this.editKey = null;
    this.proposal.set(null);
  }

  /** Takes the proposal back. Only available while nothing else has changed the plan (see `canDiscard`). */
  discard(): void {
    if (!this.canDiscard()) return;
    this.plan.undo();
    this.editKey = null;
    this.proposal.set(null);
  }

  stop(): void {
    this.abort?.abort();
  }

  clear(): void {
    if (this.busy()) return;
    this.history = [];
    this.entries.set([]);
  }

  /** Sends a message and lets the AI work until it replies without asking for more commands. */
  async send(text: string): Promise<void> {
    text = text.trim();
    if (!text || this.busy()) return;
    const provider = this.settings.createProvider();
    if (!provider) return this.say('error', 'Choose a model and add an API key first (Settings above).');

    this.say('user', text);
    this.history.push({ role: 'user', content: [{ type: 'text', text }] });
    this.busy.set(true);
    this.elapsed.set(0);
    const started = Date.now();
    const timer = setInterval(() => this.elapsed.set(Math.floor((Date.now() - started) / 1000)), 1000);
    const abort = (this.abort = new AbortController());
    try {
      for (let step = 0; ; step++) {
        if (step === MAX_STEPS) return this.say('error', `Stopped after ${MAX_STEPS} steps. Ask it to continue if it was not done.`);
        this.live = {};
        this.status.set(step ? `Asking the model… (step ${step + 1})` : 'Asking the model…');
        const reply = await provider.send({
          system: SYSTEM_PROMPT,
          messages: withLatestImagesOnly(this.history),
          tools: this.tools(),
          signal: abort.signal,
          onEvent: (e) => this.onStream(e),
        });
        this.history.push(reply);
        this.finishReplyText(reply);
        const calls = reply.content.filter((b): b is Extract<AiBlock, { type: 'tool_use' }> => b.type === 'tool_use');
        if (!calls.length) return;
        const results: AiBlock[] = [];
        for (const c of calls) results.push(await this.runToolCall(c));
        this.history.push({ role: 'user', content: results });
      }
    } catch (e) {
      this.closeOpenToolCalls();
      if (abort.signal.aborted) this.say('action', 'Stopped.');
      else this.say('error', e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(timer);
      this.busy.set(false);
      this.status.set('');
      this.abort = null;
    }
  }

  private onStream(e: AiStreamEvent): void {
    if (e.type === 'tool') this.status.set(`Writing ${e.name}…`);
    else this.stream(e.type === 'text' ? 'assistant' : 'thinking', e.delta);
  }

  /** Appends streamed text to the step's entry of that kind, starting one on the first piece. */
  private stream(kind: 'assistant' | 'thinking', delta: string): void {
    const at = this.live[kind];
    if (at === undefined) {
      this.entries.update((entries) => {
        this.live[kind] = entries.length;
        return [...entries, { kind, text: delta.trimStart() }];
      });
    } else {
      this.entries.update((entries) => entries.map((x, i) => (i === at ? { ...x, text: x.text + delta } : x)));
    }
  }

  /** Settles the reply's text: replaces what streamed with the final text, or adds it if nothing streamed. */
  private finishReplyText(reply: AiMessage): void {
    const text = reply.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    const at = this.live.assistant;
    if (at !== undefined) this.entries.update((entries) => entries.flatMap((x, i) => (i !== at ? [x] : text ? [{ ...x, text }] : [])));
    else if (text) this.say('assistant', text);
    const thought = this.live.thinking;
    if (thought !== undefined) this.entries.update((entries) => entries.map((x, i) => (i === thought ? { ...x, text: x.text.trim() } : x)));
  }

  /** Renders the plan as it is now: a JPEG data URL of the `top` or `corner` view. */
  snapshot(view: SnapshotView): Promise<string> {
    return this.snapshotter({
      plan: this.plan.plan(),
      rooms: this.plan.rooms(),
      segments: this.plan.segments(),
      models: this.modelLibrary,
      images: this.imageLibrary,
      view,
      ...SNAPSHOT_SIZE,
    });
  }

  /** The commands, plus the screenshot tool for the chosen mode. */
  private tools(): AiToolSpec[] {
    const screenshots = viewPlanTool(this.settings.config().screenshots);
    return screenshots ? [...commandSpecs(), screenshots] : commandSpecs();
  }

  private async viewPlan(call: Extract<AiBlock, { type: 'tool_use' }>): Promise<AiBlock> {
    const fail = (error: string): AiBlock => {
      this.say('action', `✗ view_plan: ${error}`);
      return { type: 'tool_result', toolUseId: call.id, content: error, isError: true };
    };
    const tool = viewPlanTool(this.settings.config().screenshots);
    if (!tool) return fail('Screenshots are turned off.');
    const problem = validate(tool.inputSchema as Parameters<typeof validate>[0], call.input ?? {});
    if (problem) return fail(problem);
    const view = (call.input as { view: SnapshotView }).view;
    this.status.set('Taking a screenshot…');
    try {
      const image = await this.snapshot(view);
      this.entries.update((e) => [...e, { kind: 'action', text: `Looked at the ${view} view`, image }]);
      return {
        type: 'tool_result',
        toolUseId: call.id,
        content: `Screenshot of the ${view} view of the plan as it is now.`,
        images: [{ mediaType: 'image/jpeg', data: image.slice(image.indexOf(',') + 1) }],
      };
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }

  private async runToolCall(call: Extract<AiBlock, { type: 'tool_use' }>): Promise<AiBlock> {
    if (call.name === VIEW_PLAN_NAME) return this.viewPlan(call);
    const result = this.execute({ name: call.name, args: call.input });
    if (!result.ok) this.say('action', `✗ ${call.name}: ${result.error}`);
    else if (!isReadOnlyCommand(call.name)) this.say('action', result.summary);
    const content = result.ok ? JSON.stringify(result.output) : result.error;
    return { type: 'tool_result', toolUseId: call.id, content: content.slice(0, MAX_RESULT_CHARS), isError: !result.ok };
  }

  /** A request that ended early leaves tool calls unanswered, which the next request would be refused for. */
  private closeOpenToolCalls(): void {
    const last = this.history[this.history.length - 1];
    if (last?.role !== 'assistant') return;
    const open = last.content.filter((b) => b.type === 'tool_use');
    if (open.length) {
      this.history.push({
        role: 'user',
        content: open.map((b) => ({ type: 'tool_result', toolUseId: (b as { id: string }).id, content: 'Interrupted before it ran.', isError: true })),
      });
    }
  }

  private say(kind: ChatEntry['kind'], text: string): void {
    this.entries.update((e) => [...e, { kind, text }]);
  }
}
