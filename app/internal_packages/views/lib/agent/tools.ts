import { localized } from 'mailspring-exports';
import { Diagnostic } from '../authoring/diagnostics';
import { ViewRevision } from '../authoring/revisions';
import { checkSignedRevision, SignedRevision } from './signing';
import { RevisionEntry, ToolContent } from './types';

/**
 * The client half of the agent's custom tools (preview_revision, request_examples,
 * request_screenshot, ask_user). Each executor returns the tool result content; anything that needs the user goes
 * through `ask`, which the session store turns into the panel's pending request.
 */

export type ToolResult = { content: ToolContent[]; isError?: boolean };

export interface ToolDeps {
  viewId: string;
  identityId: () => string;
  publicKey: () => Promise<string | null>;
  lastAcceptedRevision: (viewId: string) => number;
  setAcceptedRevision: (viewId: string, revision: number) => void;
  applyAndWait: (
    viewId: string,
    revision: ViewRevision
  ) => Promise<{ status: 'ok' | 'failed' | 'timeout'; diagnostics: Diagnostic[] }>;
  capturePreview: (viewId: string) => Promise<{ png: Buffer; width: number; height: number }>;
  /** Resolves once the latest revision has finished applying (or a cap passes). */
  waitForLatestRevision: () => Promise<RevisionWait>;
  recordRevision: (entry: RevisionEntry) => void;
  ask: (
    request:
      | { kind: 'examples'; prompt: string }
      | { kind: 'question'; prompt: string; choices?: string[] }
      | {
          kind: 'screenshot';
          prompt: string;
          screenshot: { dataUrl: string; width: number; height: number; note?: string };
        }
  ) => Promise<ToolResult>;
}

// Kinds that tell the agent whether a revision works. Console output is left out because a
// View's own logging is where mail content would show up.
const RELAYED_KINDS = [
  'compile-error',
  'runtime-error',
  'unhandled-rejection',
  'bridge-error',
  'crash',
  'hang',
  'render-ok',
  'consent',
];
const MAX_RELAYED_MESSAGE = 500;
const MAX_SOURCE_LINE = 200;
const BUILTIN_ERROR_NAMES = [
  'Error',
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
];

const trimmed = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/**
 * A runtime error reduced to what the host can vouch for: the built-in error type and the line
 * of View.jsx it was thrown from, quoted from the revision the agent itself sent. The message
 * is left out because the View chooses it (`throw new Error(subjects.join())`).
 */
function runtimeErrorSummary(d: Diagnostic, sourceLines: string[]) {
  const name = /^([A-Za-z]+Error)\b/.exec(d.stack || '');
  const frame = /View\.jsx:(\d+):(\d+)/.exec(d.stack || '');
  const line = frame ? Number(frame[1]) : 0;
  const source = line >= 1 && line <= sourceLines.length ? sourceLines[line - 1] : null;
  return {
    kind: d.kind,
    error: name && BUILTIN_ERROR_NAMES.includes(name[1]) ? name[1] : 'Error',
    ...(source !== null
      ? {
          location: { line, column: Math.min(Number(frame[2]), source.length + 1) },
          source: trimmed(source.trim(), MAX_SOURCE_LINE),
        }
      : {}),
  };
}

/**
 * Diagnostics as sent to the agent: failures and the render-ok signal, built only from what
 * the host produced. Text the View controls (runtime error messages, bridge error messages and
 * parameter names, console output) stays on this machine, so a View can't use its own errors
 * to send mail to the agent. `viewSource` is the View.jsx of the revision being reported.
 */
export function relayableDiagnostics(diagnostics: Diagnostic[], viewSource = '') {
  const sourceLines = viewSource.split('\n');
  return diagnostics
    .filter((d) => RELAYED_KINDS.includes(d.kind))
    .map((d) => {
      if (d.kind === 'runtime-error' || d.kind === 'unhandled-rejection') {
        return runtimeErrorSummary(d, sourceLines);
      }
      if (d.kind === 'bridge-error') {
        return {
          kind: d.kind,
          method: d.method,
          code: d.code,
          ...(d.permission ? { permission: d.permission } : {}),
        };
      }
      return {
        kind: d.kind,
        message: trimmed(d.message, MAX_RELAYED_MESSAGE),
        ...(d.location ? { location: d.location } : {}),
      };
    });
}

export function summarizeOutcome(status: string, diagnostics: Diagnostic[]) {
  if (status === 'ok') return 'Rendered without errors';
  if (status === 'timeout') return 'Did not finish rendering';
  const failure = diagnostics.find((d) => d.kind !== 'render-ok' && d.kind !== 'console');
  if (!failure) return 'Failed';
  const where = failure.location ? ` at View.jsx:${failure.location.line}` : '';
  return `${failure.kind}${where}: ${failure.message.split('\n')[0].slice(0, 120)}`;
}

const text = (value: string | object): ToolResult => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
});
const failure = (message: string): ToolResult => ({ ...text(message), isError: true });

async function previewRevision(deps: ToolDeps, input: SignedRevision, signature?: string) {
  const check = checkSignedRevision({
    input,
    signature,
    publicKey: await deps.publicKey(),
    identityId: deps.identityId(),
    viewId: deps.viewId,
    lastAcceptedRevision: deps.lastAcceptedRevision(deps.viewId),
  });
  if (check.ok === false) {
    deps.recordRevision({
      revision: (input && input.revision) || 0,
      status: 'rejected',
      summary: check.reason,
      ts: Date.now(),
    });
    return failure(`Revision rejected by the client: ${check.reason}`);
  }
  deps.setAcceptedRevision(deps.viewId, input.revision);
  deps.recordRevision({
    revision: input.revision,
    status: 'applying',
    summary: 'Applying…',
    ts: Date.now(),
  });
  let outcome: { status: 'ok' | 'failed' | 'timeout'; diagnostics: Diagnostic[] };
  try {
    outcome = await deps.applyAndWait(deps.viewId, {
      manifest: input.manifest,
      files: input.files,
    });
  } catch (err) {
    // writeView validation: bad file names, missing View.jsx, oversized files.
    deps.recordRevision({
      revision: input.revision,
      status: 'failed',
      summary: err.message,
      ts: Date.now(),
    });
    return text({
      status: 'failed',
      diagnostics: [{ kind: 'compile-error', message: err.message }],
    });
  }
  deps.recordRevision({
    revision: input.revision,
    status: outcome.status,
    summary: summarizeOutcome(outcome.status, outcome.diagnostics),
    ts: Date.now(),
  });
  return text({
    status: outcome.status,
    diagnostics: relayableDiagnostics(outcome.diagnostics, input.files['View.jsx']),
  });
}

export function screenshotPrompt(input: { reason?: string } | null) {
  return (input && input.reason) || 'The agent would like to see the preview.';
}

export type RevisionWait = 'ok' | 'none' | 'failed' | 'still-applying';

/** The caption for a screenshot taken before the latest revision rendered successfully. */
export function screenshotNote(wait: RevisionWait) {
  if (wait === 'failed') {
    return localized("The latest revision didn't render, so this shows the View as it is now.");
  }
  if (wait === 'still-applying') {
    return localized('The latest revision is still loading, so this shows the View as it is now.');
  }
  return undefined;
}

async function requestScreenshot(deps: ToolDeps, input: { reason?: string }) {
  // Agents often ask in the same turn as a preview; capturing then shows the old revision.
  const wait = await deps.waitForLatestRevision();
  let shot: { png: Buffer; width: number; height: number };
  try {
    shot = await deps.capturePreview(deps.viewId);
  } catch (err) {
    return failure(`Couldn't capture the preview: ${err.message}`);
  }
  return deps.ask({
    kind: 'screenshot',
    prompt: screenshotPrompt(input),
    screenshot: {
      dataUrl: `data:image/png;base64,${shot.png.toString('base64')}`,
      width: shot.width,
      height: shot.height,
      note: screenshotNote(wait),
    },
  });
}

export async function runClientTool(
  deps: ToolDeps,
  name: string,
  input: any,
  signature?: string
): Promise<ToolResult> {
  switch (name) {
    case 'preview_revision':
      return previewRevision(deps, input, signature);
    case 'request_examples':
      return deps.ask({ kind: 'examples', prompt: String((input && input.prompt) || '') });
    case 'request_screenshot':
      return requestScreenshot(deps, input);
    case 'ask_user':
      return deps.ask({
        kind: 'question',
        prompt: String((input && input.question) || ''),
        choices: Array.isArray(input && input.choices) ? input.choices.map(String) : undefined,
      });
    default:
      return failure(`The client doesn't implement a tool named "${name}".`);
  }
}
