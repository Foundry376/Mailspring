import { ipcRenderer } from 'electron';
import MailspringStore from 'mailspring-store';
import type { LocalAIAnswer, LocalAIRequest, LocalAIStatus } from '../../browser/local-ai-service';
import type {
  LocalModelProvider,
  LocalModelState,
  LocalModelStatus,
} from '../../browser/local-model';

export type {
  LocalAIAnswer,
  LocalAIRequest,
  LocalAIStatus,
  LocalModelProvider,
  LocalModelState,
  LocalModelStatus,
};

/**
 * The on-device model, for any feature that wants to run prompts locally. A renderer mirror of
 * the main process's local AI service (app/src/browser/local-ai-service.ts): which model is in
 * use (Apple's system model or the downloadable one), its download, and the prompt queue.
 *
 * The main process follows the AI settings on its own: turning AI on with the local backend
 * (AIStore) starts the download, and turning AI off deletes the model. `status()` starts
 * listening for changes. Build prompts with `chatPrompt` (local-model-prompt.ts), which both
 * backends understand.
 */
class LocalModelStore extends MailspringStore {
  private _status: LocalModelStatus | null = null;
  private _listening = false;

  /** The last status received; null until the main process first answers. */
  status() {
    this._listen();
    return this._status;
  }

  /** Whether prompts can run now, and the model version to key any caller-side caches by. */
  availability(): Promise<LocalAIStatus> {
    return ipcRenderer.invoke('local-ai:status');
  }

  /**
   * Queues prompts and resolves with one answer per item, in order. Answers are cached in the
   * main process by (item id, prompt key, model); an item cancelled with `cancel` resolves null.
   */
  run(req: LocalAIRequest): Promise<(LocalAIAnswer | null)[]> {
    return ipcRenderer.invoke('local-ai:run', req);
  }

  /** Drops every queued prompt `ownerId` asked for, returning how many were dropped. */
  cancel(ownerId: string): Promise<number> {
    return ipcRenderer.invoke('local-ai:cancel', ownerId);
  }

  /** `force` skips the free-space check. */
  startDownload(force: boolean) {
    return this._invoke('local-ai:download', force);
  }

  cancelDownload() {
    return this._invoke('local-ai:cancel-download');
  }

  /** `auto` uses Apple's model when this Mac has it; the main process downloads Qwen if needed. */
  setProvider(provider: LocalModelProvider) {
    AppEnv.config.set('core.ai.local.model', provider);
  }

  deleteDownloaded(): Promise<{ bytesFreed: number }> {
    return ipcRenderer.invoke('local-ai:delete-downloaded').finally(() => this.refresh());
  }

  async refresh() {
    try {
      this._set(await ipcRenderer.invoke('local-ai:model-status'));
    } catch (err) {
      // The main process isn't serving the model; callers treat it as unavailable.
    }
  }

  private async _invoke(channel: string, ...args: any[]) {
    try {
      await ipcRenderer.invoke(channel, ...args);
    } finally {
      await this.refresh();
    }
  }

  private _set(status: LocalModelStatus) {
    this._status = status;
    this.trigger();
  }

  private _listen() {
    if (this._listening) return;
    this._listening = true;
    ipcRenderer.on('local-ai:model-status', (_event, status: LocalModelStatus) =>
      this._set(status)
    );
    this.refresh();
  }
}

export default new LocalModelStore();
