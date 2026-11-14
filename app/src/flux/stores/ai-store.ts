import MailspringStore from 'mailspring-store';
import { localized } from '../../intl';
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
  /** The user turned AI features on: get ready to answer, e.g. by downloading a model. */
  prepare(): void;
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
  prepare() {
    LocalModelStore.prepare().catch(() => {});
  },
  run({ system, items, ...rest }) {
    return LocalModelStore.run({
      ...rest,
      items: items.map(({ id, user }) => ({ id, prompt: chatPrompt(system, user) })),
    });
  },
  cancel(ownerId) {
    return LocalModelStore.cancel(ownerId);
  },
};

const ENABLED_KEY = 'core.ai.enabled';
const BACKEND_KEY = 'core.ai.backend';
const featureKey = (id: string) => `core.ai.features.${id}`;

/**
 * AI features in the mailbox, as opposed to inside Views, which use the on-device model on
 * their own. Everything here is opt-in: nothing runs until the user turns on AI features in
 * Preferences > AI, which also lets them switch off individual features.
 *
 * Features ask `isFeatureOn` before showing any UI and send prompts through `run`, which goes
 * to the selected backend.
 */
class AIStore extends MailspringStore {
  private _backends = new Map<string, AIBackend>([[LocalBackend.id, LocalBackend]]);
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
    if (this.isEnabled()) this.backend().prepare();
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
    if (enabled) this.backend().prepare();
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

  run(req: AIRequest) {
    return this.backend().run(req);
  }

  cancel(ownerId: string) {
    return this.backend().cancel(ownerId);
  }
}

export default new AIStore();
