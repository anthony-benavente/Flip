import { computed, Injectable, signal } from '@angular/core';
import { AiProvider } from './ai-provider';
import { ScreenshotMode } from './snapshot';
import { ANTHROPIC_MODELS, AnthropicProvider } from './anthropic-provider';
import { OPENAI_BASE_URL, OpenAiCompatibleProvider } from './openai-provider';

export type AiProviderKind = 'anthropic' | 'openai';

export interface AiConfig {
  kind: AiProviderKind;
  apiKey: string;
  model: string;
  /** OpenAI-compatible services only. */
  baseUrl: string;
  /** Which screenshots of the plan the model may take; `off` for models that cannot see images or to save cost. */
  screenshots: ScreenshotMode;
}

const KEY = 'flip.ai';
const DEFAULTS: AiConfig = { kind: 'anthropic', apiKey: '', model: ANTHROPIC_MODELS[0], baseUrl: OPENAI_BASE_URL, screenshots: 'corner' };

/** Which AI service the consult tab talks to. Saved in this browser only (the key included). */
@Injectable({ providedIn: 'root' })
export class AiSettings {
  private readonly state = signal<AiConfig>(load());
  readonly config = this.state.asReadonly();
  /** True once there is enough to make a request. */
  readonly ready = computed(() => {
    const c = this.state();
    return !!c.model.trim() && (c.kind === 'openai' ? !!c.baseUrl.trim() : !!c.apiKey.trim());
  });

  update(patch: Partial<AiConfig>): void {
    const next = { ...this.state(), ...patch };
    // Each service has its own model names; start from a sensible one when switching.
    if (patch.kind && patch.kind !== this.state().kind && patch.model === undefined) next.model = patch.kind === 'anthropic' ? ANTHROPIC_MODELS[0] : '';
    this.state.set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Blocked or full storage only means the settings are not remembered.
    }
  }

  /** The provider for the current settings, or null while they are incomplete. */
  createProvider(): AiProvider | null {
    if (!this.ready()) return null;
    const c = this.state();
    return c.kind === 'anthropic'
      ? new AnthropicProvider(c.apiKey.trim(), c.model.trim())
      : new OpenAiCompatibleProvider(c.baseUrl.trim(), c.apiKey.trim(), c.model.trim());
  }
}

function load(): AiConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return DEFAULTS;
    const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
    return {
      kind: raw.kind === 'openai' ? 'openai' : 'anthropic',
      apiKey: str(raw.apiKey, ''),
      model: str(raw.model, DEFAULTS.model),
      baseUrl: str(raw.baseUrl, DEFAULTS.baseUrl),
      // Settings saved before the choice existed had a plain on/off.
      screenshots: ['off', 'corner', 'all'].includes(raw.screenshots) ? raw.screenshots : raw.vision === false ? 'off' : 'corner',
    };
  } catch {
    return DEFAULTS;
  }
}
