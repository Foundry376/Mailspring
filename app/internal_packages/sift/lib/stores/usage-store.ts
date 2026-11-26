import MailspringStore from 'mailspring-store';
import type { Usage } from '../ai/openrouter';

/** Token counts and spend for this app session, shown in Preferences → Sift. */
class UsageStore extends MailspringStore {
  requests = 0;
  inputTokens = 0;
  outputTokens = 0;
  /** USD, as reported by OpenRouter. */
  cost = 0;

  record(usage?: Usage | null) {
    if (!usage) return;
    this.requests += 1;
    this.inputTokens += usage.prompt_tokens || 0;
    this.outputTokens += usage.completion_tokens || 0;
    this.cost += usage.cost || 0;
    this.trigger();
  }

  summary() {
    const dollars = this.cost < 0.01 ? `$${this.cost.toFixed(4)}` : `$${this.cost.toFixed(2)}`;
    return `${this.requests} requests · ${this.inputTokens.toLocaleString()} in / ${this.outputTokens.toLocaleString()} out tokens · ${dollars}`;
  }
}

export const usageStore = new UsageStore();
