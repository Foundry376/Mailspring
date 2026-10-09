import {
  BrowserWindow,
  utilityProcess,
  UtilityProcess,
  IpcMain,
  IpcMainInvokeEvent,
} from 'electron';
import path from 'path';
import { isMailspringWindowContents } from './mailspring-window';
import { cacheKey, EXTRACTION_MODEL_VERSION, ModelSpec } from './extraction-model';
import {
  LocalModelController,
  LocalModelMode,
  LocalModelProvider,
  onSystemModelChange,
  freeBytesOnVolume,
} from './local-model';
import { appleFMHelper, configureAppleFM, getSystemModel, probeSystemModel } from './apple-fm';
import {
  AppleFMBackend,
  backendModelVersion,
  ModelBackendId,
  selectBackend,
} from './local-model-provider';

/**
 * Main-process owner of on-device extraction and generation for Views.
 *
 * The renderer (the views package) builds prompts and normalizes answers; this service decides
 * what runs when, remembers answers, and keeps the model in a utility process
 * (extraction-worker.js). Prompts run one at a time: the model is memory-bound, and parallel
 * sequences measured no faster per message.
 *
 * Answers are cached by (message, schema, model) in their own SQLite file. The mail database
 * is read-only outside the sync engine, and a message's body never changes, so an answer is
 * computed once and kept until the pinned model changes.
 */

// Leaves the UI's cores alone; 8 threads measured no faster than 4.
const CPU_THREADS = 4;
// Room for a packed briefing digest (≈3k tokens) plus its answer.
const CONTEXT_SIZE = 8192;
const MAX_OUTPUT_TOKENS = 200;
const MAX_REQUESTED_OUTPUT_TOKENS = 600;
// The model holds ~600 MB; release it when no View has asked for a while.
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000;

// In a packaged app the worker and node-llama-cpp are unpacked from the asar (build.js), and
// they must be loaded from there: node-llama-cpp is ESM with native binaries next to it.
function unpacked(filePath: string) {
  return filePath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
}
const MAX_ITEMS_PER_REQUEST = 50;
const MAX_PROMPT_CHARS = 16000;

export interface ExtractionItem {
  messageId: string;
  prompt: string;
}

export interface ExtractionRequest {
  viewId: string;
  /** Lower runs first. Visible Views send 0, background Views 1. */
  priority: number;
  schemaHash: string;
  /** Null asks for free text, returned as `{ text }`. */
  jsonSchema: object | null;
  items: ExtractionItem[];
  /** Answer from the cache only; misses come back null instead of being queued. */
  cacheOnly?: boolean;
  maxTokens?: number;
}

export interface ExtractionAnswer {
  messageId: string;
  value: { [field: string]: any } | null;
  cached: boolean;
  ms: number;
}

interface QueuedItem {
  viewId: string;
  priority: number;
  order: number;
  schemaHash: string;
  jsonSchema: object | null;
  maxTokens: number;
  item: ExtractionItem;
  resolve: (answer: ExtractionAnswer | null) => void;
}

class ExtractionService {
  private configDirPath: string;
  private model: LocalModelController;
  private worker: UtilityProcess | null = null;
  private workerReady: Promise<{ gpu: string }> | null = null;
  private workerCalls = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private nextCallId = 1;
  private queue: QueuedItem[] = [];
  private nextOrder = 0;
  private running = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private db: any = null;
  private apple: AppleFMBackend | null = null;
  constructor(configDirPath: string, model: LocalModelController) {
    this.configDirPath = configDirPath;
    this.model = model;
  }

  /** Apple's model when it's available and the user hasn't picked Qwen; Qwen otherwise. */
  backend(): ModelBackendId {
    return selectBackend(this.model.status().provider, getSystemModel());
  }

  /** Part of every cache key, so switching backends or updating macOS never reuses answers. */
  modelVersion(backend = this.backend()) {
    return backendModelVersion(backend, EXTRACTION_MODEL_VERSION, getSystemModel());
  }

  private appleBackend() {
    if (!this.apple) {
      this.apple = new AppleFMBackend(appleFMHelper(), () => getSystemModel().contextSize || 4096);
    }
    return this.apple;
  }

  status() {
    const model = this.model.state();
    const backend = this.backend();
    return {
      available: backend === 'apple-fm' || !!this.model.modelPath(),
      modelVersion: this.modelVersion(backend),
      backend,
      // Apple rate-limits background work on battery; answers are waiting, not failing.
      throttled: backend === 'apple-fm' && !!this.apple && this.apple.throttled,
      downloading: model.kind === 'downloading',
      download:
        model.kind === 'downloading'
          ? { received: model.receivedBytes, total: model.totalBytes }
          : { received: 0, total: this.model.spec.size },
      queued: this.queue.length,
      model,
    };
  }

  /** Stops the worker when the model goes away, e.g. after downloads are turned off. */
  shutdownWorker() {
    if (this.worker) this.worker.kill();
  }

  /**
   * Resolves with one answer per item, in order. Items answered from the cache cost nothing
   * and are marked `cached` so the caller doesn't meter them. Items dropped by
   * cancelJobsForView resolve to null.
   */
  async run(req: ExtractionRequest): Promise<(ExtractionAnswer | null)[]> {
    const db = this.cache();
    const version = this.modelVersion();
    return Promise.all(
      req.items.map((item) => {
        const key = cacheKey(item.messageId, req.schemaHash, version);
        const hit = db.prepare('SELECT value FROM answers WHERE key = ?').get(key);
        if (hit) {
          return Promise.resolve({
            messageId: item.messageId,
            value: JSON.parse(hit.value),
            cached: true,
            ms: 0,
          });
        }
        if (req.cacheOnly) return Promise.resolve(null);
        return new Promise<ExtractionAnswer | null>((resolve) => {
          this.queue.push({
            viewId: req.viewId,
            priority: req.priority,
            order: this.nextOrder++,
            schemaHash: req.schemaHash,
            jsonSchema: req.jsonSchema,
            maxTokens: req.maxTokens || MAX_OUTPUT_TOKENS,
            item,
            resolve,
          });
          this.pump();
        });
      })
    );
  }

  /** Drops every queued prompt for a View, e.g. when it reloads or closes. */
  cancelJobsForView(viewId: string) {
    const dropped = this.queue.filter((q) => q.viewId === viewId);
    this.queue = this.queue.filter((q) => q.viewId !== viewId);
    for (const q of dropped) q.resolve(null);
    return dropped.length;
  }

  private cache() {
    if (!this.db) {
      const Database = require('better-sqlite3');
      this.db = new Database(path.join(this.configDirPath, 'extraction-cache.db'));
      this.db.pragma('journal_mode = WAL');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS answers (key TEXT PRIMARY KEY, value TEXT NOT NULL, createdAt INTEGER NOT NULL)'
      );
    }
    return this.db;
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        this.queue.sort((a, b) => a.priority - b.priority || a.order - b.order);
        const next = this.queue.shift();
        let answer: ExtractionAnswer | null = null;
        try {
          const backend = this.backend();
          const result =
            backend === 'apple-fm'
              ? // A guardrail refusal comes back as `value: null`, the same "no value" the host
                // already handles for an email that doesn't state a field.
                await this.appleBackend().run({
                  prompt: next.item.prompt,
                  jsonSchema: next.jsonSchema,
                  maxTokens: next.maxTokens,
                })
              : await this.runOnWorker(next);
          answer = {
            messageId: next.item.messageId,
            value: result.value,
            cached: false,
            ms: result.ms,
          };
          if (result.value) {
            this.cache()
              .prepare('INSERT OR REPLACE INTO answers (key, value, createdAt) VALUES (?, ?, ?)')
              .run(
                cacheKey(next.item.messageId, next.schemaHash, this.modelVersion(backend)),
                JSON.stringify(result.value),
                Date.now()
              );
          }
        } catch (err) {
          // The renderer treats a failed prompt like an email with no value; the code
          // (e.g. Apple's `rateLimited`) only shows up here.
          console.warn(`Extraction failed: ${(err && (err.code || err.message)) || err}`);
          answer = { messageId: next.item.messageId, value: null, cached: false, ms: 0 };
        }
        next.resolve(answer);
      }
    } finally {
      this.running = false;
      this.scheduleIdleShutdown();
    }
  }

  private async runOnWorker(next: QueuedItem) {
    await this.ensureWorker();
    return this.callWorker({
      type: 'run',
      prompt: next.item.prompt,
      jsonSchema: next.jsonSchema,
      schemaKey: next.schemaHash,
      maxTokens: next.maxTokens,
    });
  }

  private scheduleIdleShutdown() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.queue.length === 0 && !this.running && this.worker) {
        this.worker.kill();
      }
    }, IDLE_SHUTDOWN_MS);
  }

  private ensureWorker(): Promise<{ gpu: string }> {
    if (this.workerReady) return this.workerReady;
    const modelPath = this.model.modelPath();
    if (!modelPath) return Promise.reject(new Error('The extraction model is not downloaded.'));

    const worker = utilityProcess.fork(unpacked(path.join(__dirname, 'extraction-worker.js')), [], {
      serviceName: 'Mailspring Extraction',
      env: {
        ...process.env,
        MAILSPRING_APP_NODE_MODULES: unpacked(path.join(__dirname, '..', '..', 'node_modules')),
      },
    });
    this.worker = worker;
    worker.on('message', ({ id, result, error }) => {
      const call = this.workerCalls.get(id);
      if (!call) return;
      this.workerCalls.delete(id);
      if (error) call.reject(new Error(error));
      else call.resolve(result);
    });
    worker.on('exit', () => {
      for (const call of this.workerCalls.values()) call.reject(new Error('Extraction stopped.'));
      this.workerCalls.clear();
      if (this.worker === worker) {
        this.worker = null;
        this.workerReady = null;
      }
    });
    this.workerReady = this.callWorker({
      type: 'load',
      modelPath,
      gpu: true,
      threads: CPU_THREADS,
      contextSize: CONTEXT_SIZE,
    });
    this.workerReady.catch(() => worker.kill());
    return this.workerReady;
  }

  private callWorker(message: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextCallId++;
      this.workerCalls.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...message });
    });
  }
}

let service: ExtractionService | null = null;

export function cancelJobsForView(viewId: string) {
  return service ? service.cancelJobsForView(viewId) : 0;
}

function trusted(event: IpcMainInvokeEvent) {
  if (!isMailspringWindowContents(event.sender)) {
    throw new Error('Extraction is only available to Mailspring windows.');
  }
}

function validRequest(req: any): ExtractionRequest {
  if (!req || typeof req.viewId !== 'string' || typeof req.schemaHash !== 'string') {
    throw new Error('Invalid extraction request.');
  }
  if (!Array.isArray(req.items) || req.items.length > MAX_ITEMS_PER_REQUEST) {
    throw new Error('Invalid extraction request.');
  }
  for (const item of req.items) {
    if (typeof item.messageId !== 'string' || typeof item.prompt !== 'string') {
      throw new Error('Invalid extraction request.');
    }
    if (item.prompt.length > MAX_PROMPT_CHARS) item.prompt = item.prompt.slice(0, MAX_PROMPT_CHARS);
  }
  return {
    viewId: req.viewId,
    priority: req.priority === 0 ? 0 : 1,
    schemaHash: req.schemaHash,
    jsonSchema: req.jsonSchema && typeof req.jsonSchema === 'object' ? req.jsonSchema : null,
    items: req.items,
    cacheOnly: !!req.cacheOnly,
    maxTokens: Math.min(
      Math.max(Number(req.maxTokens) || MAX_OUTPUT_TOKENS, 1),
      MAX_REQUESTED_OUTPUT_TOKENS
    ),
  };
}

interface ConfigLike {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
}

/**
 * `core.views.localModelTestSource` ({ url, size, sha256 }) replaces the pinned model in dev
 * mode, so the download flow can be exercised against a small local file.
 */
function modelSpecOverride(config: ConfigLike, devMode: boolean): ModelSpec | undefined {
  const source = devMode ? config.get('core.views.localModelTestSource') : null;
  if (!source || !source.url || !source.size || !source.sha256) return undefined;
  return {
    id: 'test-model',
    label: source.label || 'Test model',
    fileName: 'test-model.bin',
    url: source.url,
    size: Number(source.size),
    sha256: String(source.sha256),
  };
}

export function registerExtractionIPCHandlers(
  ipcMain: IpcMain,
  {
    configDirPath,
    config,
    devMode,
  }: { configDirPath: string; config: ConfigLike; devMode: boolean }
) {
  const broadcast = (channel: string, payload: any) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && isMailspringWindowContents(win.webContents)) {
        win.webContents.send(channel, payload);
      }
    }
  };
  const model = new LocalModelController({
    configDirPath,
    spec: modelSpecOverride(config, devMode),
    getMode: () => (config.get('core.views.localModel') === 'off' ? 'off' : 'auto'),
    setMode: (mode: LocalModelMode) => config.set('core.views.localModel', mode),
    getProvider: () => (config.get('core.views.localModelProvider') === 'qwen' ? 'qwen' : 'auto'),
    setProvider: (provider: LocalModelProvider) =>
      config.set('core.views.localModelProvider', provider),
    getAutoStarted: () => !!config.get('core.views.localModelAutoStarted'),
    setAutoStarted: () => config.set('core.views.localModelAutoStarted', true),
    getOverridePath: () => config.get('core.views.extractionModelPath'),
    // Dev mode: `core.views.localModelTestFreeBytes` simulates a nearly full disk.
    freeBytes: (dir: string) => {
      const simulated = devMode ? config.get('core.views.localModelTestFreeBytes') : null;
      return simulated != null ? Number(simulated) : freeBytesOnVolume(dir);
    },
    onChange: (status) => {
      if (status.state.kind === 'disabled' && service) service.shutdownWorker();
      broadcast('local-model:status', status);
    },
  });
  onSystemModelChange(() => model.systemChanged());
  service = new ExtractionService(configDirPath, model);
  // Until this probe answers, the system model reads `checking` and no Qwen download starts,
  // so Macs with Apple Intelligence never fetch a model they don't need.
  configureAppleFM({
    resourcePath: path.resolve(__dirname, '..', '..'),
    resourcesDir: process.resourcesPath,
  });
  probeSystemModel();
  ipcMain.handle('extraction:status', (event) => {
    trusted(event);
    return service.status();
  });
  ipcMain.handle('extraction:download', (event) => {
    trusted(event);
    model.start({ force: false });
    return service.status();
  });
  ipcMain.handle('local-model:status', (event) => {
    trusted(event);
    return model.status();
  });
  ipcMain.handle('local-model:views-opened', (event) => {
    trusted(event);
    model.viewsOpened();
    return model.state();
  });
  ipcMain.handle('local-model:start', (event, force: boolean) => {
    trusted(event);
    model.start({ force: !!force });
    return model.state();
  });
  ipcMain.handle('local-model:cancel', (event) => {
    trusted(event);
    model.cancel();
    return model.state();
  });
  ipcMain.handle('local-model:set-enabled', (event, enabled: boolean) => {
    trusted(event);
    return model.setEnabled(!!enabled);
  });
  ipcMain.handle('local-model:set-provider', (event, provider: string) => {
    trusted(event);
    model.setProvider(provider === 'qwen' ? 'qwen' : 'auto');
    return model.status();
  });
  ipcMain.handle('local-model:delete-downloaded', (event) => {
    trusted(event);
    return model.deleteDownloaded();
  });
  ipcMain.handle('extraction:run', (event, req) => {
    trusted(event);
    return service.run(validRequest(req));
  });
  ipcMain.handle('extraction:cancel-view', (event, viewId: string) => {
    trusted(event);
    return cancelJobsForView(String(viewId));
  });
}
