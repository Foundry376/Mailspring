import fs from 'fs';
import path from 'path';
import {
  EXTRACTION_MODEL,
  ModelSpec,
  downloadModel,
  downloadedModelPath,
  modelDir,
  partialModelPath,
} from './extraction-model';

/**
 * Owns the on-device model Views use for ai.extract / ai.summarize / ai.generate: whether one
 * is available, downloading it the first time someone opens Views, and the user's choice to
 * turn model downloads off entirely. Lives in the main process so a download survives window
 * reloads; renderers read it through the `local-model:*` IPC channels.
 */

export type LocalModelMode = 'auto' | 'off';
/** `auto` uses the system model when there is one, else the downloadable model. */
export type LocalModelProvider = 'auto' | 'qwen';

export type LocalModelState =
  | { kind: 'system'; label: string }
  /** The system model's availability is still being checked. */
  | { kind: 'checking'; label: string }
  /** Apple Intelligence is on but its model is still downloading or preparing. */
  | { kind: 'system-preparing'; label: string }
  /** The Mac supports Apple Intelligence but it's turned off; the user can enable it or download. */
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

/** A system-provided model (Apple's Foundation Models on supported Macs). */
export interface SystemModel {
  available: boolean;
  /** Why it's unavailable, e.g. 'appleIntelligenceNotEnabled'. */
  reason?: string;
  name: string;
  contextSize?: number;
}

// Required lazily so this module works on platforms and builds without the Apple helper.
function appleFm(): {
  getSystemModel: () => SystemModel;
  onSystemModelChange: (cb: () => void) => () => void;
} | null {
  try {
    return require('./apple-fm');
  } catch (err) {
    return null;
  }
}

/** Apple's on-device model (apple-fm.ts) when this Mac has it; otherwise unavailable. */
export function detectSystemModel(): SystemModel {
  const fm = appleFm();
  return fm
    ? fm.getSystemModel()
    : { available: false, reason: 'helperMissing', name: 'Apple Intelligence' };
}

export function onSystemModelChange(cb: () => void): () => void {
  const fm = appleFm();
  return fm ? fm.onSystemModelChange(cb) : () => {};
}

/** What renderers receive on `local-model:status`. */
export interface LocalModelStatus {
  state: LocalModelState;
  provider: LocalModelProvider;
  system: SystemModel;
  /** Bytes of downloaded or partially downloaded model files. */
  bytesOnDisk: number;
}

/** Free space required before a download starts on its own; the model plus headroom. */
export const MIN_FREE_BYTES_FOR_AUTO_DOWNLOAD = 2 * 1024 * 1024 * 1024;

const PROGRESS_INTERVAL_MS = 250;

export interface LocalModelDeps {
  configDirPath: string;
  spec?: ModelSpec;
  getMode: () => LocalModelMode;
  setMode: (mode: LocalModelMode) => void;
  getProvider?: () => LocalModelProvider;
  setProvider?: (provider: LocalModelProvider) => void;
  getAutoStarted: () => boolean;
  setAutoStarted: () => void;
  /** `core.views.extractionModelPath`: a local copy used in development instead of downloading. */
  getOverridePath: () => string | undefined;
  freeBytes?: (dir: string) => number | null;
  download?: typeof downloadModel;
  detectSystem?: () => SystemModel;
  onChange: (status: LocalModelStatus) => void;
}

function fileSize(filePath: string | undefined) {
  if (!filePath) return null;
  try {
    return fs.statSync(filePath).size;
  } catch (err) {
    return null;
  }
}

function unlinkQuietly(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    // already gone
  }
}

export function freeBytesOnVolume(dir: string): number | null {
  try {
    // The models directory may not exist yet; its parent (the config dir) always does.
    const target = fs.existsSync(dir) ? dir : path.dirname(dir);
    const stats = fs.statfsSync(target);
    return stats.bavail * stats.bsize;
  } catch (err) {
    return null;
  }
}

export class LocalModelController {
  private d: Required<LocalModelDeps>;
  private abort: AbortController | null = null;
  private progress = { received: 0, total: 0 };
  private lastError: string | null = null;
  private diskBlocked: { freeBytes: number } | null = null;
  private lastEmit = 0;
  private pendingEmit: NodeJS.Timeout | null = null;
  private awaitingSystemCheck = false;

  constructor(deps: LocalModelDeps) {
    this.d = {
      spec: EXTRACTION_MODEL,
      freeBytes: freeBytesOnVolume,
      download: downloadModel,
      detectSystem: detectSystemModel,
      getProvider: () => 'auto',
      setProvider: () => {},
      ...deps,
    };
    // A caller passing `spec: undefined` (no dev override) must not erase the default.
    if (!this.d.spec) this.d.spec = EXTRACTION_MODEL;
  }

  get spec() {
    return this.d.spec;
  }

  private hasQwen() {
    return fileSize(downloadedModelPath(this.d.configDirPath, this.d.spec)) === this.d.spec.size;
  }

  usesSystemModel() {
    return this.d.getProvider() === 'auto' && this.d.detectSystem().available;
  }

  status(): LocalModelStatus {
    return {
      state: this.state(),
      provider: this.d.getProvider(),
      system: this.d.detectSystem(),
      bytesOnDisk: this.bytesOnDisk(),
    };
  }

  /**
   * Switches between the system model and the downloadable one. Choosing the downloadable
   * model starts its download; going back to the system model stops any download but keeps
   * finished files until the user deletes them (`deleteDownloaded`).
   */
  setProvider(provider: LocalModelProvider) {
    this.d.setProvider(provider);
    if (provider === 'qwen') {
      this.d.setAutoStarted();
      this.start({ force: false });
    } else if (this.abort) {
      this.cancel();
    }
    this.emit(true);
  }

  /** Deletes the downloadable model's files, returning the bytes freed. */
  deleteDownloaded(): { bytesFreed: number } {
    const bytesFreed = this.bytesOnDisk();
    this.cancel();
    unlinkQuietly(downloadedModelPath(this.d.configDirPath, this.d.spec));
    this.emit(true);
    return { bytesFreed };
  }

  /** The downloadable model file the extraction worker should load, or null. */
  modelPath(): string | null {
    if (this.d.getMode() === 'off') return null;
    const override = this.d.getOverridePath();
    if (override && fileSize(override) === this.d.spec.size) return override;
    const downloaded = downloadedModelPath(this.d.configDirPath, this.d.spec);
    return fileSize(downloaded) === this.d.spec.size ? downloaded : null;
  }

  state(): LocalModelState {
    const { spec } = this.d;
    const label = spec.label;
    const totalBytes = spec.size;
    if (this.d.getMode() === 'off') return { kind: 'disabled', label, totalBytes };
    const system = this.d.detectSystem();
    if (this.d.getProvider() === 'auto') {
      if (system.available) return { kind: 'system', label: system.name };
      if (system.reason === 'checking') return { kind: 'checking', label: system.name };
      if (system.reason === 'modelNotReady')
        return { kind: 'system-preparing', label: system.name };
      if (system.reason === 'appleIntelligenceNotEnabled' && !this.abort && !this.hasQwen()) {
        return { kind: 'system-disabled', label: system.name, totalBytes };
      }
    }
    const override = this.d.getOverridePath();
    if (override && fileSize(override) === spec.size) {
      return { kind: 'ready', label, sizeBytes: spec.size, source: 'dev' };
    }
    if (fileSize(downloadedModelPath(this.d.configDirPath, spec)) === spec.size) {
      return { kind: 'ready', label, sizeBytes: spec.size, source: 'downloaded' };
    }
    if (this.abort) {
      return {
        kind: 'downloading',
        label,
        receivedBytes: this.progress.received,
        totalBytes: this.progress.total || totalBytes,
      };
    }
    if (this.diskBlocked) {
      return {
        kind: 'insufficient-disk',
        label,
        freeBytes: this.diskBlocked.freeBytes,
        requiredBytes: MIN_FREE_BYTES_FOR_AUTO_DOWNLOAD,
        totalBytes,
      };
    }
    if (this.lastError) return { kind: 'error', label, message: this.lastError, totalBytes };
    return { kind: 'not-downloaded', label, totalBytes };
  }

  /**
   * Called whenever Views are opened. Starts the download the first time, and resumes one a
   * previous launch left partway; after the user cancels, it waits for them to ask again.
   */
  viewsOpened() {
    const kind = this.state().kind;
    // While the system model is being checked, a later systemChanged() decides.
    this.awaitingSystemCheck = kind === 'checking';
    if (kind !== 'not-downloaded' && kind !== 'error') return;
    const hasPartial = fileSize(partialModelPath(this.d.configDirPath, this.d.spec)) !== null;
    if (this.d.getAutoStarted() && !hasPartial) return;
    this.d.setAutoStarted();
    this.start({ force: false });
  }

  /** The system model's availability changed (e.g. its first probe finished). */
  systemChanged() {
    if (this.awaitingSystemCheck && this.state().kind !== 'checking') this.viewsOpened();
    this.emit(true);
  }

  /** `force` skips the free-space check (the "Download anyway" button). */
  start({ force }: { force: boolean }) {
    if (this.d.getMode() === 'off' || this.abort) return;
    if (this.modelPath() || this.usesSystemModel()) return;
    if (!force) {
      const free = this.d.freeBytes(modelDir(this.d.configDirPath));
      if (free !== null && free < MIN_FREE_BYTES_FOR_AUTO_DOWNLOAD) {
        this.diskBlocked = { freeBytes: free };
        this.emit(true);
        return;
      }
    }
    this.diskBlocked = null;
    this.lastError = null;
    const abort = new AbortController();
    this.abort = abort;
    this.progress = {
      received: fileSize(partialModelPath(this.d.configDirPath, this.d.spec)) || 0,
      total: this.d.spec.size,
    };
    this.emit(true);
    this.d
      .download(
        this.d.configDirPath,
        (p) => {
          this.progress = p;
          this.emit(false);
        },
        { spec: this.d.spec, signal: abort.signal }
      )
      .then(
        () => {
          if (this.abort === abort) this.abort = null;
          this.emit(true);
        },
        (err: Error) => {
          if (this.abort !== abort) return; // cancelled; cancel() already reported
          this.abort = null;
          this.lastError = err.message || 'The download failed.';
          this.emit(true);
        }
      );
  }

  /** Stops a download and deletes what it fetched so far. */
  cancel() {
    if (this.abort) {
      const abort = this.abort;
      this.abort = null;
      abort.abort();
    }
    unlinkQuietly(partialModelPath(this.d.configDirPath, this.d.spec));
    this.lastError = null;
    this.diskBlocked = null;
    this.emit(true);
  }

  /** Bytes the downloaded model and any partial download occupy; the dev override isn't ours. */
  bytesOnDisk() {
    return (
      (fileSize(downloadedModelPath(this.d.configDirPath, this.d.spec)) || 0) +
      (fileSize(partialModelPath(this.d.configDirPath, this.d.spec)) || 0)
    );
  }

  /**
   * Turning model downloads off cancels any download and deletes the model files, returning
   * the bytes freed. Turning them back on starts a download.
   */
  setEnabled(enabled: boolean): { bytesFreed: number } {
    if (!enabled) {
      const bytesFreed = this.bytesOnDisk();
      this.cancel();
      unlinkQuietly(downloadedModelPath(this.d.configDirPath, this.d.spec));
      this.d.setMode('off');
      this.emit(true);
      return { bytesFreed };
    }
    this.d.setMode('auto');
    this.d.setAutoStarted();
    this.start({ force: false });
    this.emit(true);
    return { bytesFreed: 0 };
  }

  private emit(immediate: boolean) {
    const now = Date.now();
    if (immediate || now - this.lastEmit >= PROGRESS_INTERVAL_MS) {
      if (this.pendingEmit) clearTimeout(this.pendingEmit);
      this.pendingEmit = null;
      this.lastEmit = now;
      this.d.onChange(this.status());
      return;
    }
    if (!this.pendingEmit) {
      this.pendingEmit = setTimeout(() => this.emit(true), PROGRESS_INTERVAL_MS);
    }
  }
}
