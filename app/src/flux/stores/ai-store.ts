import MailspringStore from 'mailspring-store';
import { localized } from '../../intl';
import KeyManager from '../../key-manager';
import * as Actions from '../actions';
import { AI_CONFIG, DEFAULT_OPENROUTER_MODEL, OPENROUTER_KEY_NAME } from '../../browser/ai-config';
import LocalModelStore from './local-model-store';
import { chatPrompt } from './local-model-prompt';
import type { LocalAIAnswer } from './local-model-store';

/**
 * The kinds of work an AI feature can ask for. A backend lists the ones it does well, and a
 * feature names the ones it needs, so a feature the selected backend can't do well is hidden
 * instead of run badly.
 */
export type AICapability =
  /** A short structured summary of one message. */
  | 'summarize'
  /** Sorting one message into labels the caller defines, e.g. for mail rules. */
  | 'classify'
  /** Pulling named fields (prices, dates, tracking numbers) out of one message. */
  | 'extract'
  /** Rewriting text the user wrote: shorter, more formal, fixed grammar. */
  | 'rewrite'
  /** Writing new mail from an instruction and the thread it replies to. */
  | 'draft'
  /** Reasoning over several messages at once, e.g. where a whole thread stands. */
  | 'multi-message'
  /** Several rounds of tool calls, e.g. an assistant that searches mail to answer. */
  | 'agent';

export interface AIRequest {
  /** Who asked. `cancel(ownerId)` drops everything an owner has queued. */
  ownerId: string;
  /** 0 when someone is waiting on the answer, 1 for background work. Lower runs first. */
  priority: number;
  /** Names the prompt and schema; part of the answer cache key, so bump it when either changes. */
  promptKey: string;
  /** Instructions shared by every item. */
  system: string;
  /** Null asks for free text, returned as `{ text }`. */
  jsonSchema: object | null;
  maxTokens?: number;
  /** Answer from the cache only; misses come back null instead of being queued. */
  cacheOnly?: boolean;
  /** `id` identifies what the prompt is about (a message id, …) and keys the cache. */
  items: { id: string; user: string }[];
}

export type AIAnswer = LocalAIAnswer;

export interface AIBackend {
  id: string;
  displayName: string;
  /** True when prompts, and the mail in them, leave this computer. */
  remote: boolean;
  capabilities: ReadonlySet<AICapability>;
  /** Resolves with one answer per item, in order; null where an item failed or was cancelled. */
  run(req: AIRequest): Promise<(AIAnswer | null)[]>;
  cancel(ownerId: string): Promise<number>;
}

export interface AIFeature {
  id: string;
  displayName: string;
  description: string;
  requires: AICapability[];
}

// Both backends run in the main process's AI service, which routes each prompt to the one
// selected in config; the descriptors below tell features what each can do.
function runInService({ system, items, ...rest }: AIRequest) {
  return LocalModelStore.run({
    ...rest,
    items: items.map(({ id, user }) => ({ id, prompt: chatPrompt(system, user) })),
  });
}

/**
 * Apple's on-device model on supported Macs, else the downloadable Qwen model. Both are small:
 * on our eval sets they answered faithfully about one message at a time and mixed up details
 * across several, and their free writing isn't good enough to send as the user.
 */
export const LocalBackend: AIBackend = {
  id: 'local',
  get displayName() {
    return localized('On this computer');
  },
  remote: false,
  capabilities: new Set<AICapability>(['summarize', 'classify', 'extract']),
  run: runInService,
  cancel(ownerId) {
    return LocalModelStore.cancel(ownerId);
  },
};

/**
 * OpenRouter, with the user's own key and the model they pick. Prompts and the mail in them
 * leave this computer, for OpenRouter and the provider serving the model. Large hosted models
 * can write and reason across a thread, which the local models can't do well.
 */
export const OpenRouterBackend: AIBackend = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  remote: true,
  capabilities: new Set<AICapability>([
    'summarize',
    'classify',
    'extract',
    'rewrite',
    'draft',
    'multi-message',
    'agent',
  ]),
  run: runInService,
  cancel(ownerId) {
    return LocalModelStore.cancel(ownerId);
  },
};

const ENABLED_KEY = AI_CONFIG.enabled;
const BACKEND_KEY = AI_CONFIG.backend;
const featureKey = (id: string) => `core.ai.features.${id}`;

/**
 * The one switch for AI in Mailspring, in the mailbox and inside Views, and the backend it
 * runs on: this computer, or OpenRouter. AI is off until the user turns it on in
 * Preferences > AI. Turning it on with the local backend downloads the model where the system
 * has none, and turning it off deletes it; the main process does both when this config
 * changes (local-ai-service.ts).
 *
 * Mailbox features ask `isFeatureOn` before showing any UI and send prompts through `run`,
 * which goes to the selected backend. Preferences lists them with their own switches.
 */
class AIStore extends MailspringStore {
  private _backends = new Map<string, AIBackend>([
    [LocalBackend.id, LocalBackend],
    [OpenRouterBackend.id, OpenRouterBackend],
  ]);
  private _features = new Map<string, AIFeature>();

  constructor() {
    super();
    AppEnv.config.onDidChange('core.ai', () => this.trigger());
  }

  registerBackend(backend: AIBackend) {
    this._backends.set(backend.id, backend);
    this.trigger();
  }

  unregisterBackend(id: string) {
    if (id === LocalBackend.id) return;
    this._backends.delete(id);
    this.trigger();
  }

  backends(): AIBackend[] {
    return [...this._backends.values()];
  }

  /** The selected backend; the on-device one when the selected one isn't installed. */
  backend(): AIBackend {
    return this._backends.get(AppEnv.config.get(BACKEND_KEY)) || LocalBackend;
  }

  setBackend(id: string) {
    AppEnv.config.set(BACKEND_KEY, id);
  }

  openRouterModel(): string {
    return AppEnv.config.get(AI_CONFIG.openRouterModel) || DEFAULT_OPENROUTER_MODEL;
  }

  setOpenRouterModel(model: string) {
    AppEnv.config.set(AI_CONFIG.openRouterModel, model.trim() || null);
  }

  hasOpenRouterKey(): boolean {
    return AppEnv.config.get(AI_CONFIG.openRouterHasKey) === true;
  }

  /** The key goes to the system keychain via KeyManager; config only records that one exists. */
  async setOpenRouterKey(key: string | null) {
    if (key) {
      await KeyManager.replacePassword(OPENROUTER_KEY_NAME, key.trim());
      AppEnv.config.set(AI_CONFIG.openRouterHasKey, true);
    } else {
      await KeyManager.deletePassword(OPENROUTER_KEY_NAME);
      AppEnv.config.set(AI_CONFIG.openRouterHasKey, false);
    }
  }

  can(...capabilities: AICapability[]) {
    const { capabilities: available } = this.backend();
    return capabilities.every((c) => available.has(c));
  }

  isEnabled(): boolean {
    return AppEnv.config.get(ENABLED_KEY) === true;
  }

  setEnabled(enabled: boolean) {
    AppEnv.config.set(ENABLED_KEY, enabled);
  }

  registerFeature(feature: AIFeature) {
    this._features.set(feature.id, feature);
    this.trigger();
  }

  unregisterFeature(id: string) {
    this._features.delete(id);
    this.trigger();
  }

  /** Registered features the selected backend can run; the ones Preferences lists. */
  features(): AIFeature[] {
    return [...this._features.values()].filter((f) => this.can(...f.requires));
  }

  /** The user's switch for one feature. Features are on once AI features are. */
  isFeatureEnabled(id: string): boolean {
    return AppEnv.config.get(featureKey(id)) !== false;
  }

  setFeatureEnabled(id: string, enabled: boolean) {
    AppEnv.config.set(featureKey(id), enabled);
  }

  /** Whether a feature should show and run right now. */
  isFeatureOn(id: string): boolean {
    const feature = this._features.get(id);
    return (
      !!feature && this.isEnabled() && this.isFeatureEnabled(id) && this.can(...feature.requires)
    );
  }

  /** Opens Preferences > AI, where the user picks a backend. */
  openSettings() {
    Actions.openPreferences();
    Actions.switchPreferencesTab('AI');
  }

  /**
   * Asks the user to turn AI on, in a modal, for a feature that needs it. Resolves with
   * whether AI is on afterwards. Prefer rendering EnableAIPrompt where there's room for it.
   */
  requestEnable(opts: { reason: string; requires?: AICapability[] }): Promise<boolean> {
    // Required lazily: the prompt is a component, and it reads this store.
    return require('../../components/enable-ai-prompt').requestAIEnabled(opts);
  }

  run(req: AIRequest) {
    return this.backend().run(req);
  }

  cancel(ownerId: string) {
    return this.backend().cancel(ownerId);
  }
}

export default new AIStore();
