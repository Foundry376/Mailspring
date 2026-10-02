import { EventEmitter } from 'events';

export type DiagnosticKind =
  | 'compile-error'
  | 'runtime-error'
  | 'unhandled-rejection'
  | 'console'
  | 'bridge-error'
  | 'crash'
  | 'hang'
  | 'render-ok'
  | 'screenshot-taken';

/**
 * One thing that happened to a View, shaped to be relayed to the agent that wrote it.
 *
 * Records carry no mail data by construction: bridge errors list parameter names and types,
 * never values or results. `message` and `stack` on runtime errors and console records are
 * produced by the View's own code at runtime, so a View that logs a subject line puts that
 * subject here; those records are marked `untrusted` so a relay can ask before sending them.
 */
export interface Diagnostic {
  ts: number;
  viewId: string;
  /** Content hash of the View.jsx that produced this record (see revisionOf). */
  revision: string | null;
  kind: DiagnosticKind;
  message: string;
  level?: 'warning' | 'error';
  stack?: string;
  location?: { line: number; column: number };
  method?: string;
  code?: string;
  params?: string;
  untrusted?: boolean;
}

const BUFFER_SIZE = 200;
const MAX_MESSAGE = 1000;
const MAX_STACK = 4000;
// How long a freshly mounted View must go without an error before it counts as working.
export const RENDER_OK_QUIET_MS = 1500;

const FAILURE_KINDS: DiagnosticKind[] = [
  'compile-error',
  'runtime-error',
  'unhandled-rejection',
  'crash',
  'hang',
];

export function isFailure(d: Diagnostic) {
  return FAILURE_KINDS.includes(d.kind);
}

const truncate = (s: any, max: number) => {
  const str = typeof s === 'string' ? s : String(s ?? '');
  return str.length > max ? `${str.slice(0, max)}…` : str;
};

// Rewrites guest URLs in stack traces to the author's file. Sucrase preserves line numbers,
// so view.js:LINE:COL is View.jsx:LINE:COL (see compiledViewSource in view-sessions.ts).
export function authorStack(stack: string) {
  return stack
    .replace(/mailspring-view:\/\/[^/\s]+\/view\.js:(\d+):(\d+)/g, 'View.jsx:$1:$2')
    .replace(/mailspring-view:\/\/[^/\s]+\/_(runtime|lib)\//g, '<$1>/');
}

// Sucrase reports syntax errors as "… (LINE:COL)".
export function locationOf(message: string, stack?: string) {
  const fromMessage = /\((\d+):(\d+)\)/.exec(message || '');
  if (fromMessage) return { line: Number(fromMessage[1]), column: Number(fromMessage[2]) };
  const fromStack = /View\.jsx:(\d+):(\d+)/.exec(stack || '');
  if (fromStack) return { line: Number(fromStack[1]), column: Number(fromStack[2]) };
  return undefined;
}

/** Parameter names and types only: `{ query: object, limit: number }`. Never values. */
export function summarizeParams(params: any) {
  if (!params || typeof params !== 'object') return typeof params;
  const parts = Object.keys(params)
    .slice(0, 12)
    .map((key) => {
      const value = params[key];
      const type = Array.isArray(value)
        ? `array(${value.length})`
        : value === null
          ? 'null'
          : typeof value;
      return `${key}: ${type}`;
    });
  return `{ ${parts.join(', ')} }`;
}

class DiagnosticsStore extends EventEmitter {
  private buffers = new Map<string, Diagnostic[]>();
  private revisions = new Map<string, string | null>();
  private renderTimers = new Map<string, NodeJS.Timeout>();

  /** The revision the View's current page loaded, as reported by its loader. */
  revisionFor(viewId: string) {
    return this.revisions.get(viewId) || null;
  }

  pageLoaded(viewId: string, revision: string | null) {
    this.revisions.set(viewId, revision);
    this.cancelRenderOk(viewId);
  }

  /**
   * The View's first render committed. If nothing fails for RENDER_OK_QUIET_MS, record
   * `render-ok`: the signal an authoring loop waits for to accept a revision.
   */
  mounted(viewId: string) {
    this.cancelRenderOk(viewId);
    const revision = this.revisionFor(viewId);
    this.renderTimers.set(
      viewId,
      setTimeout(() => {
        this.renderTimers.delete(viewId);
        if (this.revisionFor(viewId) !== revision) return;
        this.add({ viewId, kind: 'render-ok', message: 'Rendered without errors.' });
      }, RENDER_OK_QUIET_MS)
    );
  }

  private cancelRenderOk(viewId: string) {
    const timer = this.renderTimers.get(viewId);
    if (timer) clearTimeout(timer);
    this.renderTimers.delete(viewId);
  }

  add(input: Omit<Diagnostic, 'ts' | 'revision'> & { revision?: string | null }) {
    const record: Diagnostic = {
      ...input,
      ts: Date.now(),
      revision: input.revision !== undefined ? input.revision : this.revisionFor(input.viewId),
      message: truncate(input.message, MAX_MESSAGE),
    };
    if (input.stack) record.stack = truncate(authorStack(input.stack), MAX_STACK);
    if (!record.location && (input.kind === 'compile-error' || input.kind === 'runtime-error')) {
      const location = locationOf(record.message, record.stack);
      if (location) record.location = location;
    }
    if (isFailure(record)) this.cancelRenderOk(record.viewId);

    let buffer = this.buffers.get(record.viewId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(record.viewId, buffer);
    }
    // React logs the errors its boundary catches, so a runtime error usually arrives twice:
    // first as console text, then as the structured report. Keep the structured one.
    if (record.kind === 'runtime-error' && record.message) {
      const recent = record.ts - 2000;
      for (let i = buffer.length - 1; i >= 0 && buffer[i].ts >= recent; i--) {
        if (buffer[i].kind === 'console' && buffer[i].message.includes(record.message)) {
          buffer.splice(i, 1);
        }
      }
    }
    buffer.push(record);
    if (buffer.length > BUFFER_SIZE) buffer.splice(0, buffer.length - BUFFER_SIZE);
    this.emit('diagnostic', record);
    return record;
  }

  get(viewId: string, { revision }: { revision?: string } = {}): Diagnostic[] {
    const buffer = this.buffers.get(viewId) || [];
    return revision ? buffer.filter((d) => d.revision === revision) : [...buffer];
  }

  clear(viewId: string) {
    this.buffers.delete(viewId);
  }

  /**
   * Resolves when `revision` of `viewId` either renders cleanly (`ok`) or reports its first
   * failure (`failed`), or after `timeoutMs`. Records already received for the revision count,
   * so this can be called after the preview started.
   */
  waitForOutcome(
    viewId: string,
    revision: string,
    timeoutMs = 15000
  ): Promise<{ status: 'ok' | 'failed' | 'timeout'; diagnostics: Diagnostic[] }> {
    const settledBy = (records: Diagnostic[]) => {
      if (records.some(isFailure)) return 'failed';
      if (records.some((d) => d.kind === 'render-ok')) return 'ok';
      return null;
    };
    const existing = settledBy(this.get(viewId, { revision }));
    if (existing) {
      return Promise.resolve({ status: existing, diagnostics: this.get(viewId, { revision }) });
    }
    return new Promise((resolve) => {
      const finish = (status: 'ok' | 'failed' | 'timeout') => {
        clearTimeout(timer);
        this.removeListener('diagnostic', onRecord);
        resolve({ status, diagnostics: this.get(viewId, { revision }) });
      };
      const onRecord = (d: Diagnostic) => {
        if (d.viewId !== viewId || d.revision !== revision) return;
        const status = settledBy([d]);
        if (status) finish(status);
      };
      const timer = setTimeout(() => finish('timeout'), timeoutMs);
      this.on('diagnostic', onRecord);
    });
  }
}

export const ViewDiagnostics = new DiagnosticsStore();
ViewDiagnostics.setMaxListeners(100);

/** The `view.diagnostic` bridge method the loader reports through. */
export function reportFromGuest(viewId: string, params: any) {
  const kind = params && params.kind;
  if (kind === 'page') {
    ViewDiagnostics.pageLoaded(
      viewId,
      typeof params.revision === 'string' ? params.revision : null
    );
    return;
  }
  if (kind === 'mounted') {
    ViewDiagnostics.mounted(viewId);
    return;
  }
  if (!['compile-error', 'runtime-error', 'unhandled-rejection'].includes(kind)) return;
  ViewDiagnostics.add({
    viewId,
    kind,
    level: 'error',
    message: params.message,
    stack: typeof params.stack === 'string' ? params.stack : undefined,
    // Compile errors come from Sucrase, not from the View's runtime.
    untrusted: kind !== 'compile-error',
  });
}
