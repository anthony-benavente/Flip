import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { CommandCall, CommandResult } from '../commands/command';
import { commandSpecs, isReadOnlyCommand, runCommand } from '../commands/run-command';
import { newId } from '../model/plan.model';
import { PlanStore } from '../state/plan.store';
import { AiBlock, AiMessage } from './ai-provider';
import { AiSettings } from './ai-settings';
import { SYSTEM_PROMPT } from './system-prompt';
import { installWindowApi } from './window-api';

/** The most model round trips one message may take, so a confused model cannot loop forever. */
export const MAX_STEPS = 25;
/** Largest tool result sent back to the model (characters). */
const MAX_RESULT_CHARS = 60_000;

export interface ChatEntry {
  kind: 'user' | 'assistant' | 'action' | 'error';
  text: string;
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

  readonly entries = signal<ChatEntry[]>([]);
  readonly busy = signal(false);
  readonly proposal = signal<Proposal | null>(null);
  /** Discarding undoes cleanly only while nothing else has edited the plan since the proposal. */
  readonly canDiscard = computed(() => {
    const p = this.proposal();
    return !!p && p.revision === this.plan.revision();
  });

  private history: AiMessage[] = [];
  private abort: AbortController | null = null;
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
    if (isReadOnlyCommand(call.name)) return runCommand(structuredClone(this.plan.plan()), call);
    const key = (this.editKey ??= `ai-${newId()}`);
    let result: CommandResult = { ok: false, error: 'The command did not run.' };
    try {
      this.plan.update(
        (draft) => {
          result = runCommand(draft, call);
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
    const abort = (this.abort = new AbortController());
    try {
      for (let step = 0; ; step++) {
        if (step === MAX_STEPS) return this.say('error', `Stopped after ${MAX_STEPS} steps. Ask it to continue if it was not done.`);
        const reply = await provider.send({ system: SYSTEM_PROMPT, messages: this.history, tools: commandSpecs(), signal: abort.signal });
        this.history.push(reply);
        for (const b of reply.content) if (b.type === 'text' && b.text.trim()) this.say('assistant', b.text.trim());
        const calls = reply.content.filter((b): b is Extract<AiBlock, { type: 'tool_use' }> => b.type === 'tool_use');
        if (!calls.length) return;
        this.history.push({ role: 'user', content: calls.map((c) => this.runToolCall(c)) });
      }
    } catch (e) {
      this.closeOpenToolCalls();
      if (abort.signal.aborted) this.say('action', 'Stopped.');
      else this.say('error', e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
      this.abort = null;
    }
  }

  private runToolCall(call: Extract<AiBlock, { type: 'tool_use' }>): AiBlock {
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
