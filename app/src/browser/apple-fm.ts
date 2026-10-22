import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { SystemModel } from './local-model';

/**
 * Talks to `mailspring-fm`, the Swift helper that reaches Apple's on-device model (protocol in
 * app/native/mailspring-fm/Sources/mailspring-fm/main.swift).
 *
 * The helper is its own process, so a crash in the framework never takes down Mailspring; it
 * is started on first use and stopped after a few idle minutes. Packaged Apple-silicon builds
 * ship it in Resources; other builds don't have it, and the system model reports
 * `helperMissing`.
 */

const IDLE_SHUTDOWN_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 15000;
// A reply the helper never sends (e.g. it couldn't parse the request) must not stall the queue.
const GENERATE_TIMEOUT_MS = 120000;
const SYSTEM_MODEL_NAME = 'Apple Intelligence';

export interface HelperAvailability {
  available: boolean;
  reason?: string;
  contextSize?: number;
  osBuild?: string;
  osVersion?: string;
}

export interface HelperGenerateRequest {
  instructions: string;
  prompt: string;
  schema?: object | null;
  maxTokens: number;
}

export interface HelperGenerateResult {
  value?: any;
  text?: string;
  ms: number;
}

export class HelperError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Where the helper lives: next to the app in packaged builds, in the Swift build dir in dev. */
export function helperCandidates(resourcePath: string, resourcesDir: string | undefined) {
  const pkg = path.join(resourcePath, 'native', 'mailspring-fm', '.build');
  return [
    resourcesDir ? path.join(resourcesDir, 'mailspring-fm') : null,
    path.join(pkg, 'out', 'Products', 'Release', 'mailspring-fm'),
    path.join(pkg, 'arm64-apple-macosx', 'release', 'mailspring-fm'),
    path.join(pkg, 'release', 'mailspring-fm'),
  ].filter(Boolean) as string[];
}

export function supportsSystemModel(
  platform = process.platform,
  arch = process.arch,
  release = os.release()
) {
  // macOS 26 is Darwin 25.
  return platform === 'darwin' && arch === 'arm64' && Number(release.split('.')[0]) >= 25;
}

/**
 * One request line. JSON.stringify leaves U+2028/U+2029 unescaped, and email text contains
 * them; escaping keeps every request on one line for any line splitter.
 */
export function encodeRequest(message: object) {
  return JSON.stringify(message)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Turns one line of helper output into a reply, or null when the line isn't one. */
export function parseHelperLine(line: string): { id: number; result?: any; error?: any } | null {
  if (!line.trim()) return null;
  try {
    const msg = JSON.parse(line);
    if (typeof msg !== 'object' || msg === null || typeof msg.id !== 'number') return null;
    return msg;
  } catch (err) {
    return null;
  }
}

export class AppleFMHelper {
  private child: ChildProcess | null = null;
  private buffer = '';
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private idleTimer: NodeJS.Timeout | null = null;
  private binPath: string | null;

  constructor(binPath: string | null) {
    this.binPath = binPath;
  }

  get installed() {
    return !!this.binPath;
  }

  async availability(): Promise<HelperAvailability> {
    return this.call({ op: 'availability' }, PROBE_TIMEOUT_MS);
  }

  warmup() {
    return this.call({ op: 'warmup' }).catch(() => {});
  }

  /** Resolves with the answer, or rejects with a HelperError (`refused`, `rateLimited`, …). */
  generate(req: HelperGenerateRequest, signal?: AbortSignal): Promise<HelperGenerateResult> {
    const id = this.nextId;
    const promise = this.call({ op: 'generate', ...req }, GENERATE_TIMEOUT_MS);
    if (signal) {
      const onAbort = () => this.call({ op: 'cancel', target: id }).catch(() => {});
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    return promise;
  }

  stop() {
    if (this.child) this.child.kill();
  }

  private ensureChild() {
    if (this.child) return this.child;
    if (!this.binPath)
      throw new HelperError('unavailable', 'The system model helper is not installed.');
    const child = spawn(this.binPath, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      let newline: number;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const msg = parseHelperLine(this.buffer.slice(0, newline));
        this.buffer = this.buffer.slice(newline + 1);
        const call = msg && this.pending.get(msg.id);
        if (!call) continue;
        this.pending.delete(msg.id);
        if (msg.error)
          call.reject(new HelperError(msg.error.code || 'failed', msg.error.message || ''));
        else call.resolve(msg.result);
      }
    });
    const fail = () => {
      for (const call of this.pending.values()) {
        call.reject(new HelperError('failed', 'The system model helper stopped.'));
      }
      this.pending.clear();
      if (this.child === child) {
        this.child = null;
        this.buffer = '';
      }
    };
    child.on('exit', fail);
    child.on('error', fail);
    return child;
  }

  private call(message: object, timeoutMs?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = this.ensureChild();
      } catch (err) {
        reject(err);
        return;
      }
      const id = this.nextId++;
      let timer: NodeJS.Timeout | null = null;
      if (timeoutMs) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new HelperError('failed', 'The system model helper did not answer.'));
        }, timeoutMs);
      }
      this.pending.set(id, {
        resolve: (v) => {
          if (timer) clearTimeout(timer);
          this.scheduleIdleShutdown();
          resolve(v);
        },
        reject: (e) => {
          if (timer) clearTimeout(timer);
          this.scheduleIdleShutdown();
          reject(e);
        },
      });
      child.stdin.write(`${encodeRequest({ id, ...message })}\n`);
    });
  }

  private scheduleIdleShutdown() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) this.stop();
    }, IDLE_SHUTDOWN_MS);
  }
}

// --- The system model, as the rest of the main process sees it ---

let helper: AppleFMHelper | null = null;
let snapshot: SystemModel & { osBuild?: string } = {
  available: false,
  reason: 'checking',
  name: SYSTEM_MODEL_NAME,
};
const listeners = new Set<(model: SystemModel) => void>();

export function configureAppleFM({
  resourcePath,
  resourcesDir,
}: {
  resourcePath: string;
  resourcesDir?: string;
}) {
  if (!supportsSystemModel()) {
    helper = new AppleFMHelper(null);
    setSnapshot({ available: false, reason: 'unsupportedOS', name: SYSTEM_MODEL_NAME });
    return;
  }
  const bin = helperCandidates(resourcePath, resourcesDir).find((p) => fs.existsSync(p)) || null;
  helper = new AppleFMHelper(bin);
  if (!bin) setSnapshot({ available: false, reason: 'helperMissing', name: SYSTEM_MODEL_NAME });
}

export function appleFMHelper() {
  return helper;
}

/** Synchronous snapshot; `reason: 'checking'` until the first probe finishes. */
export function getSystemModel(): SystemModel & { osBuild?: string } {
  return snapshot;
}

export function onSystemModelChange(cb: (model: SystemModel) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setSnapshot(next: SystemModel & { osBuild?: string }) {
  const changed = JSON.stringify(next) !== JSON.stringify(snapshot);
  snapshot = next;
  if (changed) listeners.forEach((cb) => cb(snapshot));
}

/** Asks the helper whether Apple's model can run now. Safe to call repeatedly. */
export async function probeSystemModel(): Promise<SystemModel> {
  if (!helper || !helper.installed) return snapshot;
  try {
    const a = await helper.availability();
    setSnapshot({
      available: !!a.available,
      reason: a.available ? undefined : a.reason || 'unknown',
      name: SYSTEM_MODEL_NAME,
      contextSize: a.contextSize,
      osBuild: a.osBuild,
    });
  } catch (err) {
    setSnapshot({ available: false, reason: 'helperFailed', name: SYSTEM_MODEL_NAME });
  }
  return snapshot;
}
