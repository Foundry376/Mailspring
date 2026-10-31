import MailspringStore from 'mailspring-store';
import { describeError } from '../ai/client';

/**
 * Tracks AI text generation that outlives the component that started it
 * (popovers close, thread cards remount when the draft appears), keyed by
 * draft (headerMessageId) or thread (`thread:<id>`).
 */
class GenerationStore extends MailspringStore {
  private running = new Map<string, { controller: AbortController; label: string }>();
  private errors = new Map<string, string>();

  isRunning(key: string) {
    return this.running.has(key);
  }

  labelFor(key: string) {
    return this.running.get(key)?.label ?? null;
  }

  errorFor(key: string) {
    return this.errors.get(key) ?? null;
  }

  async run(key: string, label: string, task: (signal: AbortSignal) => Promise<void>) {
    this.running.get(key)?.controller.abort();
    const controller = new AbortController();
    this.running.set(key, { controller, label });
    this.errors.delete(key);
    this.trigger();
    try {
      await task(controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) this.errors.set(key, describeError(err));
    } finally {
      if (this.running.get(key)?.controller === controller) this.running.delete(key);
      this.trigger();
    }
  }

  stop(key: string) {
    this.running.get(key)?.controller.abort();
  }
}

export const generationStore = new GenerationStore();
