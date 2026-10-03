import { utilityProcess, UtilityProcess, IpcMain, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import { isMailspringWindowContents } from './mailspring-window';
import {
  cacheKey,
  EXTRACTION_MODEL_VERSION,
  downloadModel,
  resolveModelPath,
  EXTRACTION_MODEL,
} from './extraction-model';

/**
 * Main-process owner of on-device extraction (docs/plans/sandboxed-views-exploration.md §9).
 *
 * The renderer (the views package) builds prompts and normalizes answers; this service decides
 * what runs when, remembers answers, and keeps the model in a utility process
 * (extraction-worker.js). Prompts run one at a time: the model is memory-bound, and parallel
 * sequences measured no faster per message (§9.8).
 *
 * Answers are cached by (message, schema, model) in their own SQLite file. The mail database
 * is read-only outside the sync engine, and a message's body never changes, so an answer is
 * computed once and kept until the pinned model changes.
 */

// Leaves the UI's cores alone; 8 threads measured no faster than 4 (§9.8).
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
  private getOverridePath: () => string | undefined;
  private worker: UtilityProcess | null = null;
  private workerReady: Promise<{ gpu: string }> | null = null;
  private workerCalls = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private nextCallId = 1;
  private queue: QueuedItem[] = [];
  private nextOrder = 0;
  private running = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private db: any = null;
  private download: Promise<string> | null = null;
  private downloadProgress = { received: 0, total: EXTRACTION_MODEL.size };

  constructor(configDirPath: string, getOverridePath: () => string | undefined) {
    this.configDirPath = configDirPath;
    this.getOverridePath = getOverridePath;
  }

  status() {
    const modelPath = resolveModelPath(this.configDirPath, this.getOverridePath());
    return {
      available: !!modelPath,
      modelVersion: EXTRACTION_MODEL_VERSION,
      downloading: !!this.download,
      download: this.downloadProgress,
      queued: this.queue.length,
    };
  }

  startDownload() {
    if (this.download) return;
    this.download = downloadModel(this.configDirPath, (p) => (this.downloadProgress = p)).finally(
      () => (this.download = null)
    );
    this.download.catch(() => {
      // surfaced through status(); the next startDownload() resumes from the partial file
    });
  }

  /**
   * Resolves with one answer per item, in order. Items answered from the cache cost nothing
   * and are marked `cached` so the caller doesn't meter them. Items dropped by
   * cancelJobsForView resolve to null.
   */
  async run(req: ExtractionRequest): Promise<(ExtractionAnswer | null)[]> {
    const db = this.cache();
    return Promise.all(
      req.items.map((item) => {
        const key = cacheKey(item.messageId, req.schemaHash, EXTRACTION_MODEL_VERSION);
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
          await this.ensureWorker();
          const result = await this.callWorker({
            type: 'run',
            prompt: next.item.prompt,
            jsonSchema: next.jsonSchema,
            schemaKey: next.schemaHash,
            maxTokens: next.maxTokens,
          });
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
                cacheKey(next.item.messageId, next.schemaHash, EXTRACTION_MODEL_VERSION),
                JSON.stringify(result.value),
                Date.now()
              );
          }
        } catch (err) {
          answer = { messageId: next.item.messageId, value: null, cached: false, ms: 0 };
        }
        next.resolve(answer);
      }
    } finally {
      this.running = false;
      this.scheduleIdleShutdown();
    }
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
    const modelPath = resolveModelPath(this.configDirPath, this.getOverridePath());
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

export function registerExtractionIPCHandlers(
  ipcMain: IpcMain,
  { configDirPath, getOverridePath }: { configDirPath: string; getOverridePath: () => string }
) {
  service = new ExtractionService(configDirPath, getOverridePath);
  ipcMain.handle('extraction:status', (event) => {
    trusted(event);
    return service.status();
  });
  ipcMain.handle('extraction:download', (event) => {
    trusted(event);
    service.startDownload();
    return service.status();
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
