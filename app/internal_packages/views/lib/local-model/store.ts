import { ipcRenderer } from 'electron';
import MailspringStore from 'mailspring-store';

/**
 * Renderer mirror of the main process's LocalModelController (app/src/browser/local-model.ts):
 * which on-device model Views use, its download, and the user's choice to turn model
 * downloads off.
 */

export type LocalModelState =
  | { kind: 'system'; label: string }
  | { kind: 'checking'; label: string }
  | { kind: 'system-preparing'; label: string }
  | { kind: 'system-disabled'; label: string; totalBytes: number }
  | { kind: 'ready'; label: string; sizeBytes: number; source: 'downloaded' | 'dev' }
  | { kind: 'downloading'; label: string; receivedBytes: number; totalBytes: number }
  | { kind: 'error'; label: string; message: string; totalBytes: number }
  | {
      kind: 'insufficient-disk';
      label: string;
      freeBytes: number;
      requiredBytes: number;
      totalBytes: number;
    }
  | { kind: 'not-downloaded'; label: string; totalBytes: number }
  | { kind: 'disabled'; label: string; totalBytes: number };

export interface LocalModelStatus {
  state: LocalModelState;
  provider: 'auto' | 'qwen';
  system: { available: boolean; reason?: string; name: string; contextSize?: number };
  bytesOnDisk: number;
}

/** What `ai.extract` / `ai.summarize` / `ai.generate` report to Views about the model. */
export type ModelStatusForViews = 'ready' | 'model_downloading' | 'model_off' | 'model_unavailable';

export function modelStatusForViews(status: LocalModelStatus | null): {
  modelStatus: ModelStatusForViews;
  modelProgress?: number;
} {
  if (!status) return { modelStatus: 'model_unavailable' };
  const { state } = status;
  switch (state.kind) {
    case 'system':
    case 'ready':
      return { modelStatus: 'ready' };
    case 'downloading':
      return {
        modelStatus: 'model_downloading',
        modelProgress: state.totalBytes ? state.receivedBytes / state.totalBytes : 0,
      };
    case 'disabled':
      return { modelStatus: 'model_off' };
    default:
      return { modelStatus: 'model_unavailable' };
  }
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

class LocalModelStoreImpl extends MailspringStore {
  private _status: LocalModelStatus | null = null;
  private _listening = false;

  status() {
    this._listen();
    return this._status;
  }

  /** Called whenever the Views UI opens; starts the first download in the background. */
  viewsOpened() {
    this._listen();
    return this._invoke('local-model:views-opened');
  }

  start(force: boolean) {
    return this._invoke('local-model:start', force);
  }

  cancel() {
    return this._invoke('local-model:cancel');
  }

  setEnabled(enabled: boolean): Promise<{ bytesFreed: number }> {
    return ipcRenderer.invoke('local-model:set-enabled', enabled).finally(() => this.refresh());
  }

  setProvider(provider: 'auto' | 'qwen') {
    return this._invoke('local-model:set-provider', provider);
  }

  deleteDownloaded(): Promise<{ bytesFreed: number }> {
    return ipcRenderer.invoke('local-model:delete-downloaded').finally(() => this.refresh());
  }

  async refresh() {
    try {
      this._set(await ipcRenderer.invoke('local-model:status'));
    } catch (err) {
      // the main process isn't serving the model; Views treat it as unavailable
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
    ipcRenderer.on('local-model:status', (_event, status: LocalModelStatus) => this._set(status));
    this.refresh();
  }
}

export const LocalModelStore = new LocalModelStoreImpl();
