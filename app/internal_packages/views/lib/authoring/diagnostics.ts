import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { allViews } from '../view-registry';
import { revisionOf } from './revisions';

export type DiagnosticKind =
  | 'compile-error'
  | 'runtime-error'
  | 'unhandled-rejection'
  | 'bridge-error'
  | 'crash'
  | 'hang'
  | 'render-ok'
  | 'consent';

/**
 * One thing that happened to a View, shown in the authoring UI and relayed to the agent that
 * wrote it. A View can put anything it can read into its error messages and stacks, so the
 * agent relay (agent/tools.ts) sends only fields the host produced itself.
 */
export interface Diagnostic {
  ts: number;
  viewId: string;
  /** Content hash of the View.jsx that produced this record (see revisionOf). */
  revision: string | null;
  kind: DiagnosticKind;
  message: string;
  stack?: string;
  location?: { line: number; column: number };
  method?: string;
  code?: string;
  /** For `permission` bridge errors: the permission the View lacked. */
  permission?: string;
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

// Sucrase reports syntax errors as "… (LINE:COL)".
export function locationOf(message: string, stack?: string) {
  const fromMessage = /\((\d+):(\d+)\)/.exec(message || '');
  if (fromMessage) return { line: Number(fromMessage[1]), column: Number(fromMessage[2]) };
  const fromStack = /View\.jsx:(\d+):(\d+)/.exec(stack || '');
  if (fromStack) return { line: Number(fromStack[1]), column: Number(fromStack[2]) };
  return undefined;
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
   * The View's first render committed (also emitted as `mounted`). If nothing fails for
   * RENDER_OK_QUIET_MS, record `render-ok`: the signal an authoring loop waits for to accept a
   * revision.
   */
  mounted(viewId: string) {
    this.emit('mounted', viewId);
    this.cancelRenderOk(viewId);
    this.renderTimers.set(
      viewId,
      setTimeout(() => {
        this.renderTimers.delete(viewId);
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
    if (input.stack) record.stack = truncate(input.stack, MAX_STACK);
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
  if (kind === 'compile-error') {
    // The guest's report is only a prompt to look: the host compiles the file itself, so the
    // record says what Sucrase said rather than whatever the page claims.
    const compiled = compileErrorFor(viewId);
    if (compiled) {
      ViewDiagnostics.add({ viewId, kind, ...compiled });
    }
    return;
  }
  if (!['runtime-error', 'unhandled-rejection'].includes(kind)) return;
  ViewDiagnostics.add({
    viewId,
    kind,
    message: params.message,
    stack: typeof params.stack === 'string' ? params.stack : undefined,
  });
}

/** The View's current View.jsx, as the main process would compile it. */
export function viewSource(viewId: string): string | null {
  const view = allViews().find((v) => v.id === viewId);
  try {
    return view ? fs.readFileSync(path.join(view.dir, 'View.jsx'), 'utf8') : null;
  } catch {
    return null;
  }
}

/** Sucrase's error for the View's current View.jsx, or null if it compiles. */
function compileErrorFor(viewId: string) {
  const source = viewSource(viewId);
  if (source === null) return null;
  try {
    // Same transforms as compiledViewSource in app/src/browser/view-sessions.ts.
    require('sucrase').transform(source, {
      transforms: ['jsx', 'imports'],
      jsxRuntime: 'classic',
      production: true,
      filePath: 'View.jsx',
    });
    return null;
  } catch (err) {
    return { message: String(err.message), revision: revisionOf(source) };
  }
}
