import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ANTHROPIC_MODELS } from '../../consult/anthropic-provider';
import { AiProviderKind, AiSettings } from '../../consult/ai-settings';
import { ConsultSession } from '../../consult/consult-session';
import { Icon } from '../../shared/icon';

const STARTERS = [
  'Suggest a furniture layout for each room.',
  'Try a warmer color scheme in the living room.',
  'Add decor and lighting to make it feel finished.',
  'Check the layout for problems and fix them.',
];

/**
 * Chat with an AI consultant that edits the plan through commands. Its changes are applied as one
 * undo step and listed here until the user keeps or discards them.
 */
@Component({
  selector: 'app-consult-panel',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <h2>Consult</h2>
      <button class="btn ghost" type="button" (click)="showSettings.set(!showSettings())" [attr.aria-expanded]="showSettings()">Settings</button>
      <button class="btn ghost" type="button" [disabled]="session.busy() || !session.entries().length" (click)="session.clear()">New chat</button>
    </div>

    @if (showSettings() || !settings.ready()) {
      <div class="settings">
        <label class="field">
          <span>AI service</span>
          <select class="input" aria-label="AI service" [value]="config().kind" (change)="settings.update({ kind: $any($event.target).value })">
            <option value="anthropic" [selected]="config().kind === 'anthropic'">Claude (Anthropic)</option>
            <option value="openai" [selected]="config().kind === 'openai'">OpenAI-compatible</option>
          </select>
        </label>
        @if (config().kind === 'openai') {
          <label class="field">
            <span>Base URL</span>
            <input class="input" aria-label="Base URL" [value]="config().baseUrl" (change)="settings.update({ baseUrl: $any($event.target).value })" />
          </label>
        }
        <label class="field">
          <span>Model</span>
          <input class="input" aria-label="Model" list="consult-models" [value]="config().model" placeholder="model name" (change)="settings.update({ model: $any($event.target).value })" />
          <datalist id="consult-models">
            @if (config().kind === 'anthropic') {
              @for (m of models; track m) { <option [value]="m"></option> }
            }
          </datalist>
        </label>
        <label class="field">
          <span>API key{{ config().kind === 'openai' ? ' (optional for local servers)' : '' }}</span>
          <input class="input" type="password" autocomplete="off" aria-label="API key" [value]="config().apiKey" (change)="settings.update({ apiKey: $any($event.target).value })" />
        </label>
        <p class="note">
          The key is saved in this browser only and sent only to the service you chose. The AI can read and change this plan through
          commands; anything you ask it is sent to that service.
        </p>
      </div>
    }

    <div #log class="log" role="log" aria-live="polite" aria-label="Conversation">
      @for (e of session.entries(); track $index) {
        <p class="entry" [class]="e.kind">@if (e.kind === 'thinking') { <span class="label">Thinking</span> }{{ e.text }}</p>
      } @empty {
        <p class="empty">Ask for a layout, a color scheme or decor. Changes show up on the plan right away and you decide whether to keep them.</p>
        <div class="starters">
          @for (s of starters; track s) {
            <button class="btn" type="button" [disabled]="!settings.ready()" (click)="send(s)">{{ s }}</button>
          }
        </div>
      }
      @if (session.busy()) {
        <p class="entry action status" role="status">{{ session.status() }} · {{ session.elapsed() }}s</p>
      }
    </div>

    @if (session.proposal(); as p) {
      <div class="proposal" role="group" aria-label="Proposed changes">
        <strong>{{ p.summaries.length }} change{{ p.summaries.length === 1 ? '' : 's' }} applied</strong>
        <ul>
          @for (s of p.summaries; track $index) { <li>{{ s }}</li> }
        </ul>
        <div class="buttons">
          <button class="btn primary" type="button" (click)="session.keep()"><app-icon name="plus" /> Keep</button>
          <button
            class="btn"
            type="button"
            [disabled]="!session.canDiscard()"
            [title]="session.canDiscard() ? 'Undo all of these changes' : 'You have edited the plan since; use Undo instead'"
            (click)="session.discard()"
          >
            <app-icon name="undo" /> Discard
          </button>
        </div>
      </div>
    }

    <form class="compose" (submit)="$event.preventDefault(); send(box.value); box.value = ''">
      <textarea
        #box
        class="input"
        rows="2"
        aria-label="Message"
        placeholder="Ask the consultant…"
        [disabled]="session.busy()"
        (keydown)="onKey($event, box)"
      ></textarea>
      @if (session.busy()) {
        <button class="btn" type="button" (click)="session.stop()">Stop</button>
      } @else {
        <button class="btn primary" type="submit" [disabled]="!settings.ready()">Send</button>
      }
    </form>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 10px; min-height: 0; padding: 12px; }
    .head { display: flex; align-items: center; gap: 6px; }
    h2 { flex: 1; margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
    .settings { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); }
    .field { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--text-muted); }
    .note { margin: 0; color: var(--text-muted); font-size: 12px; }
    .log { display: flex; flex-direction: column; flex: 1; gap: 8px; min-height: 120px; overflow-y: auto; }
    .entry { margin: 0; padding: 8px 10px; border-radius: var(--radius-sm); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
    .entry.user { align-self: flex-end; max-width: 90%; background: var(--accent-soft); }
    .entry.assistant { background: var(--surface-2); }
    .entry.action { padding: 2px 10px; color: var(--text-muted); font-size: 12px; }
    .entry.thinking { max-height: 110px; overflow-y: auto; padding: 4px 10px; color: var(--text-muted); font-size: 12px; font-style: italic; }
    .entry.thinking .label { display: block; font-style: normal; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; }
    .entry.error { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
    .empty { margin: 0; color: var(--text-muted); }
    .starters { display: flex; flex-direction: column; gap: 6px; }
    .starters .btn { height: auto; padding: 6px 10px; text-align: left; white-space: normal; }
    .proposal { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--accent); border-radius: var(--radius-sm); font-size: 13px; }
    .proposal ul { margin: 0; padding-left: 18px; max-height: 96px; overflow-y: auto; color: var(--text-muted); font-size: 12px; }
    .buttons { display: flex; gap: 6px; }
    .compose { display: flex; align-items: flex-end; gap: 6px; }
    .compose textarea { flex: 1; resize: none; font: inherit; }
  `,
})
export class ConsultPanel {
  protected readonly session = inject(ConsultSession);
  protected readonly settings = inject(AiSettings);
  protected readonly config = this.settings.config;
  protected readonly models = ANTHROPIC_MODELS;
  protected readonly starters = STARTERS;
  protected readonly showSettings = signal(false);
  private readonly log = viewChild.required<ElementRef<HTMLElement>>('log');

  constructor() {
    effect(() => {
      this.session.entries();
      this.session.busy();
      // After the new entry is drawn, keep the latest message in view.
      queueMicrotask(() => {
        const el = this.log().nativeElement;
        el.scrollTop = el.scrollHeight;
      });
    });
  }

  protected send(text: string): void {
    void this.session.send(text);
  }

  /** Enter sends; Shift+Enter adds a line. Keys stay in the box instead of reaching editor shortcuts. */
  protected onKey(e: KeyboardEvent, box: HTMLTextAreaElement): void {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.send(box.value);
      box.value = '';
    }
  }
}
