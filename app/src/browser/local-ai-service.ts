import {
  BrowserWindow,
  utilityProcess,
  UtilityProcess,
  IpcMain,
  IpcMainInvokeEvent,
} from 'electron';
import path from 'path';
import { isMailspringWindowContents } from './mailspring-window';
import { cacheKey, DOWNLOADABLE_MODEL_VERSION, ModelSpec } from './local-ai-model';
import {
  LocalModelController,
  LocalModelStatus,
  onSystemModelChange,
  freeBytesOnVolume,
  removeModelFiles,
} from './local-model';
import { appleFMHelper, configureAppleFM, getSystemModel, probeSystemModel } from './apple-fm';
import {
  AppleFMBackend,
  backendModelVersion,
  ModelBackendId,
  selectBackend,
} from './local-model-provider';
import { OpenRouterEngine } from './openrouter';
import { AI_CONFIG, DEFAULT_OPENROUTER_MODEL, OPENROUTER_KEY_NAME } from './ai-config';

/**
 * Main-process owner of AI: prompts from any renderer feature (Views' ai.extract, ai.summarize
 * and ai.generate today) run here, on the backend the user picked in Preferences > AI. On this
 * computer that's Apple's system model or the downloadable model in a utility process
 * (local-ai-worker.js), one prompt at a time: the model is memory-bound, and parallel sequences
 * measured no faster per prompt. Remotely it's OpenRouter (openrouter.ts), a few at a time.
 *
 * Callers build prompts and validate answers; this service decides what runs when and
 * remembers answers. Answers are cached by (item id, prompt key, model) in their own SQLite
 * file. The mail database is read-only outside the sync engine, and a message's body never
 * changes, so an answer is computed once and kept until the model changes.
 *
 * Nothing starts until the user turns AI on (`core.ai.enabled`) or a renderer asks for the
 * model's status (see registerLocalAIIPCHandlers): people who leave AI off never probe the
 * system model, download a model or start the worker.
 */

// Leaves the UI's cores alone; 8 threads measured no faster than 4.
const CPU_THREADS = 4;
// Room for the longest prompt renderers send (MAX_PROMPT_CHARS, ≈4k tokens) plus its answer.
const CONTEXT_SIZE = 8192;
const MAX_OUTPUT_TOKENS = 200;
const MAX_REQUESTED_OUTPUT_TOKENS = 600;
// The model holds ~600 MB; release it when nothing has asked for a while.
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000;
const MAX_ITEMS_PER_REQUEST = 50;
const MAX_PROMPT_CHARS = 16000;
const REMOTE_CONCURRENCY = 4;
// Named for the first feature that used it; renaming it would discard every cached answer.
const CACHE_FILE = 'extraction-cache.db';

// In a packaged app the worker and node-llama-cpp are unpacked from the asar (build.js). The
// worker must be forked from there: node-llama-cpp is ESM with native binaries next to it, and
// Node's ESM loader can't read inside an asar.
function unpacked(filePath: string) {
  return filePath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
}

export interface LocalAIItem {
  /** Stable id of what the prompt is about (a message id, `event:<id>`, …); part of the cache key. */
  id: string;
  prompt: string;
}

export interface LocalAIRequest {
  /** Who asked, e.g. a View's id. `local-ai:cancel` drops everything an owner has queued. */
  ownerId: string;
  /** 0 when someone is waiting on the answer, 1 for background work. Lower runs first. */
  priority: number;
  /**
   * Identifies the prompt template and schema. It is part of the cache key, so bump it when
   * either changes, and the worker compiles one grammar per key.
   */
  promptKey: string;
  /** Null asks for free text, returned as `{ text }`. */
  jsonSchema: object | null;
  items: LocalAIItem[];
  /** Answer from the cache only; misses come back null instead of being queued. */
  cacheOnly?: boolean;
  maxTokens?: number;
}

export interface LocalAIAnswer {
  id: string;
  value: { [field: string]: any } | null;
  cached: boolean;
  ms: number;
}

interface QueuedItem {
  ownerId: string;
  priority: number;
  order: number;
  promptKey: string;
  jsonSchema: object | null;
  maxTokens: number;
  item: LocalAIItem;
  resolve: (answer: LocalAIAnswer | null) => void;
}

export type AIEngineId = ModelBackendId | 'openrouter';

/** What the service needs to know about the user's choice of remote backend. */
export interface RemoteSettings {
  /** AI is on and runs on OpenRouter. */
  selected: () => boolean;
  model: () => string;
  /** The user saved a key; reading it may still fail (a locked keyring). */
  hasKey: () => boolean;
  apiKey: () => Promise<string | null>;
}

class LocalAIService {
  private configDirPath: string;
  private model: LocalModelController;
  private remote: RemoteSettings;
  private openrouter: OpenRouterEngine;
  /** The last remote failure, shown in Preferences so a bad key or model isn't silent. */
  private remoteError: string | null = null;
  private worker: UtilityProcess | null = null;
  private workerReady: Promise<{ gpu: string }> | null = null;
  private workerCalls = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private nextCallId = 1;
  private queue: QueuedItem[] = [];
  private nextOrder = 0;
  private active = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private db: any = null;
  private apple: AppleFMBackend | null = null;
  constructor(
    configDirPath: string,
    model: LocalModelController,
    remote: RemoteSettings,
    openrouter = new OpenRouterEngine()
  ) {
    this.configDirPath = configDirPath;
    this.model = model;
    this.remote = remote;
    this.openrouter = openrouter;
  }

  /**
   * OpenRouter when the user picked it; otherwise Apple's model when it's available and the
   * user hasn't picked Qwen, and Qwen after that.
   */
  backend(): AIEngineId {
    if (this.remote.selected()) return 'openrouter';
    return selectBackend(this.model.status().provider, getSystemModel());
  }

  /** Part of every cache key, so switching backends or models never reuses answers. */
  modelVersion(backend = this.backend()) {
    if (backend === 'openrouter') return `openrouter:${this.remote.model()}`;
    return backendModelVersion(backend, DOWNLOADABLE_MODEL_VERSION, getSystemModel());
  }

  /** AI is on, and the selected backend could answer. */
  private canRun(backend = this.backend()) {
    if (backend === 'openrouter') return this.remote.hasKey();
    return this.model.isActive() && (backend === 'apple-fm' || !!this.model.modelPath());
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
      available: this.canRun(backend),
      remote: backend === 'openrouter',
      remoteError: backend === 'openrouter' ? this.remoteError : null,
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
   * and are marked `cached` so the caller doesn't meter them. Items dropped by cancelOwner
   * resolve to null.
   */
  async run(req: LocalAIRequest): Promise<(LocalAIAnswer | null)[]> {
    // With AI off, answers cached while it was on stay unused too.
    if (!this.canRun()) return req.items.map(() => null);
    const db = this.cache();
    const version = this.modelVersion();
    return Promise.all(
      req.items.map((item) => {
        const key = cacheKey(item.id, req.promptKey, version);
        const hit = db.prepare('SELECT value FROM answers WHERE key = ?').get(key);
        if (hit) {
          return Promise.resolve({
            id: item.id,
            value: JSON.parse(hit.value),
            cached: true,
            ms: 0,
          });
        }
        if (req.cacheOnly) return Promise.resolve(null);
        return new Promise<LocalAIAnswer | null>((resolve) => {
          this.queue.push({
            ownerId: req.ownerId,
            priority: req.priority,
            order: this.nextOrder++,
            promptKey: req.promptKey,
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

  /** Drops every queued prompt for an owner, e.g. when a View reloads or closes. */
  cancelOwner(ownerId: string) {
    const dropped = this.queue.filter((q) => q.ownerId === ownerId);
    this.queue = this.queue.filter((q) => q.ownerId !== ownerId);
    for (const q of dropped) q.resolve(null);
    return dropped.length;
  }

  private cache() {
    if (!this.db) {
      const Database = require('better-sqlite3');
      this.db = new Database(path.join(this.configDirPath, CACHE_FILE));
      this.db.pragma('journal_mode = WAL');
      this.db.exec(
        'CREATE TABLE IF NOT EXISTS answers (key TEXT PRIMARY KEY, value TEXT NOT NULL, createdAt INTEGER NOT NULL)'
      );
    }
    return this.db;
  }

  /** Starts queued prompts up to the backend's concurrency: one locally, a few remotely. */
  private pump() {
    const limit = this.backend() === 'openrouter' ? REMOTE_CONCURRENCY : 1;
    while (this.active < limit && this.queue.length) {
      this.queue.sort((a, b) => a.priority - b.priority || a.order - b.order);
      const next = this.queue.shift();
      this.active++;
      this.answer(next).finally(() => {
        this.active--;
        if (this.queue.length) this.pump();
        else if (this.active === 0) this.scheduleIdleShutdown();
      });
    }
  }

  private async answer(next: QueuedItem) {
    let answer: LocalAIAnswer | null = null;
    try {
      const backend = this.backend();
      const result =
        backend === 'openrouter'
          ? await this.runRemote(next)
          : backend === 'apple-fm'
            ? // A guardrail refusal comes back as `value: null`, the same "no value" callers
              // already handle for an email that doesn't state a field.
              await this.appleBackend().run({
                prompt: next.item.prompt,
                jsonSchema: next.jsonSchema,
                maxTokens: next.maxTokens,
              })
            : await this.runOnWorker(next);
      answer = { id: next.item.id, value: result.value, cached: false, ms: result.ms };
      if (result.value) {
        this.cache()
          .prepare('INSERT OR REPLACE INTO answers (key, value, createdAt) VALUES (?, ?, ?)')
          .run(
            cacheKey(next.item.id, next.promptKey, this.modelVersion(backend)),
            JSON.stringify(result.value),
            Date.now()
          );
      }
    } catch (err) {
      // Callers treat a failed prompt as "no value"; the code (e.g. Apple's `rateLimited`)
      // only shows up here.
      console.warn(`AI prompt failed: ${(err && (err.code || err.message)) || err}`);
      answer = { id: next.item.id, value: null, cached: false, ms: 0 };
    }
    next.resolve(answer);
  }

  private async runRemote(next: QueuedItem) {
    const apiKey = await this.remote.apiKey();
    if (!apiKey) throw new Error('No OpenRouter key is saved.');
    try {
      const result = await this.openrouter.run({
        apiKey,
        model: this.remote.model(),
        prompt: next.item.prompt,
        jsonSchema: next.jsonSchema,
        maxTokens: next.maxTokens,
      });
      this.setRemoteError(null);
      return result;
    } catch (err) {
      this.setRemoteError(err.message);
      throw err;
    }
  }

  private setRemoteError(message: string | null) {
    if (message === this.remoteError) return;
    this.remoteError = message;
    broadcast('local-ai:remote-error', message);
  }

  /** Checks a key before the user saves it: its label and spending, or why it failed. */
  keyInfo(apiKey: string) {
    return this.openrouter.keyInfo(apiKey);
  }

  private async runOnWorker(next: QueuedItem) {
    await this.ensureWorker();
    return this.callWorker({
      type: 'run',
      prompt: next.item.prompt,
      jsonSchema: next.jsonSchema,
      schemaKey: next.promptKey,
      maxTokens: next.maxTokens,
    });
  }

  private scheduleIdleShutdown() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.queue.length === 0 && this.active === 0 && this.worker) {
        this.worker.kill();
      }
    }, IDLE_SHUTDOWN_MS);
  }

  private ensureWorker(): Promise<{ gpu: string }> {
    if (this.workerReady) return this.workerReady;
    const modelPath = this.model.modelPath();
    if (!modelPath) return Promise.reject(new Error('The local model is not downloaded.'));

    const worker = utilityProcess.fork(unpacked(path.join(__dirname, 'local-ai-worker.js')), [], {
      serviceName: 'Mailspring Local AI',
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
      for (const call of this.workerCalls.values()) call.reject(new Error('Local AI stopped.'));
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

export type LocalAIStatus = ReturnType<LocalAIService['status']>;

function trusted(event: IpcMainInvokeEvent) {
  if (!isMailspringWindowContents(event.sender)) {
    throw new Error('Local AI is only available to Mailspring windows.');
  }
}

function validRequest(req: any): LocalAIRequest {
  if (!req || typeof req.ownerId !== 'string' || typeof req.promptKey !== 'string') {
    throw new Error('Invalid local AI request.');
  }
  if (!Array.isArray(req.items) || req.items.length > MAX_ITEMS_PER_REQUEST) {
    throw new Error('Invalid local AI request.');
  }
  for (const item of req.items) {
    if (typeof item.id !== 'string' || typeof item.prompt !== 'string') {
      throw new Error('Invalid local AI request.');
    }
    if (item.prompt.length > MAX_PROMPT_CHARS) item.prompt = item.prompt.slice(0, MAX_PROMPT_CHARS);
  }
  return {
    ownerId: req.ownerId,
    priority: req.priority === 0 ? 0 : 1,
    promptKey: req.promptKey,
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
  onDidChange: (keyPath: string, callback: () => void) => unknown;
}

interface LocalAIDeps {
  configDirPath: string;
  config: ConfigLike;
  devMode: boolean;
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

function broadcast(channel: string, payload: any) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && isMailspringWindowContents(win.webContents)) {
      win.webContents.send(channel, payload);
    }
  }
}

const AI_KEY = 'core.ai';

/** AI is on (Preferences > AI); off, the model's files are deleted. */
function aiEnabled(config: ConfigLike) {
  return config.get(AI_CONFIG.enabled) === true;
}

/** AI is on and runs on this computer rather than a remote backend. */
function aiRunsLocally(config: ConfigLike) {
  return aiEnabled(config) && (config.get(AI_CONFIG.backend) || 'local') === 'local';
}

/**
 * Reads one secret the renderer saved with KeyManager (key-manager.ts), which keeps them all
 * in one blob encrypted with safeStorage. Decrypting again only when the blob changes avoids
 * a keychain round trip per prompt.
 */
function secretReader(config: ConfigLike, name: string) {
  let cached: { blob: string; value: string | null } | null = null;
  return async () => {
    const blob = config.get('credentials');
    if (!blob || blob === 'null') return null;
    if (cached && cached.blob === blob) return cached.value;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { safeStorage } = require('electron');
    const { result } = await safeStorage.decryptStringAsync(Buffer.from(blob, 'utf-8'));
    cached = { blob, value: JSON.parse(result)[name] || null };
    return cached.value;
  };
}

function remoteSettings(config: ConfigLike): RemoteSettings {
  return {
    selected: () => aiEnabled(config) && config.get(AI_CONFIG.backend) === 'openrouter',
    model: () => config.get(AI_CONFIG.openRouterModel) || DEFAULT_OPENROUTER_MODEL,
    hasKey: () => config.get(AI_CONFIG.openRouterHasKey) === true,
    apiKey: secretReader(config, OPENROUTER_KEY_NAME),
  };
}

/**
 * Builds the model controller and service, and starts the system model's availability probe.
 * Until that probe answers the system model reads `checking` and no Qwen download starts, so
 * Macs with Apple Intelligence never fetch a model they don't need.
 */
function startLocalAI({ configDirPath, config, devMode }: LocalAIDeps) {
  let service: LocalAIService | null = null;
  const model = new LocalModelController({
    configDirPath,
    spec: modelSpecOverride(config, devMode),
    isEnabled: () => aiEnabled(config),
    isActive: () => aiRunsLocally(config),
    getProvider: () => (config.get(AI_CONFIG.localModel) === 'qwen' ? 'qwen' : 'auto'),
    getOverridePath: () => config.get('core.views.extractionModelPath'),
    // Dev mode: `core.views.localModelTestFreeBytes` simulates a nearly full disk.
    freeBytes: (dir: string) => {
      const simulated = devMode ? config.get('core.views.localModelTestFreeBytes') : null;
      return simulated != null ? Number(simulated) : freeBytesOnVolume(dir);
    },
    onChange: (status) => {
      if (status.state.kind === 'disabled' && service) service.shutdownWorker();
      broadcast('local-ai:model-status', status);
    },
  });
  service = new LocalAIService(configDirPath, model, remoteSettings(config));
  onSystemModelChange(() => model.systemChanged());
  configureAppleFM({
    resourcePath: path.resolve(__dirname, '..', '..'),
    resourcesDir: process.resourcesPath,
  });
  probeSystemModel();
  return { model, service };
}

/**
 * Registers the `local-ai:*` channels and follows the AI settings. Registering is free while
 * AI is off: the controller, the system-model probe and the cache are created by the first
 * call or when the user turns AI on, and the model is downloaded only once AI is on with the
 * local backend, or when the user asks.
 */
export function registerLocalAIIPCHandlers(ipcMain: IpcMain, deps: LocalAIDeps) {
  const { config } = deps;
  let started: ReturnType<typeof startLocalAI> | null = null;
  const localAI = () => started || (started = startLocalAI(deps));

  if (aiEnabled(config)) {
    localAI().model.reconcile({ startDownload: false });
  } else {
    removeModelFiles(deps.configDirPath, modelSpecOverride(config, deps.devMode));
  }
  // Only the settings that decide where AI runs: a feature switch under `core.ai` mustn't
  // restart a download the user cancelled.
  const placement = () =>
    [aiEnabled(config), config.get(AI_CONFIG.backend), config.get(AI_CONFIG.localModel)].join();
  let lastPlacement = placement();
  config.onDidChange(AI_KEY, () => {
    if (placement() === lastPlacement) return;
    lastPlacement = placement();
    if (started || aiEnabled(config)) localAI().model.reconcile({ startDownload: true });
  });

  const handle = <T>(
    channel: string,
    fn: (ai: ReturnType<typeof startLocalAI>, ...args: any[]) => T
  ) =>
    ipcMain.handle(channel, (event, ...args) => {
      trusted(event);
      return fn(localAI(), ...args);
    });

  handle('local-ai:status', ({ service }) => service.status());
  handle('local-ai:model-status', ({ model }) => model.status());
  handle('local-ai:download', ({ model }, force: boolean) => {
    model.start({ force: !!force });
    return model.state();
  });
  handle('local-ai:cancel-download', ({ model }) => {
    model.cancel();
    return model.state();
  });
  handle('local-ai:delete-downloaded', ({ model }) => model.deleteDownloaded());
  handle('local-ai:openrouter-key-info', ({ service }, apiKey: string) =>
    service.keyInfo(String(apiKey)).then(
      (info) => ({ info }),
      (err) => ({ error: err.message })
    )
  );
  handle('local-ai:run', ({ service }, req) => service.run(validRequest(req)));
  // Nothing can be queued before the service starts, so cancelling doesn't start it.
  ipcMain.handle('local-ai:cancel', (event, ownerId: string) => {
    trusted(event);
    return started ? started.service.cancelOwner(String(ownerId)) : 0;
  });
}
