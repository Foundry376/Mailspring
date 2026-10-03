import { Diagnostic } from '../authoring/diagnostics';
import { ViewRevision } from '../authoring/drafts';
import { checkSignedRevision, SignedRevision } from './signing';
import { RevisionEntry, ToolContent } from './types';

/**
 * The client half of the agent's custom tools (docs/plans/views-agent-protocol.md, "Client
 * tools"). Each executor returns the tool result content; anything that needs the user goes
 * through `ask`, which the session store turns into the panel's pending request.
 */

export type ToolResult = { content: ToolContent[]; isError?: boolean };

export interface ToolDeps {
  viewId: string;
  identityId: () => string;
  publicKey: () => Promise<string | null>;
  lastAcceptedRevision: (viewId: string) => number;
  setAcceptedRevision: (viewId: string, revision: number) => void;
  previewAndWait: (
    viewId: string,
    revision: ViewRevision
  ) => Promise<{ status: 'ok' | 'failed' | 'timeout'; diagnostics: Diagnostic[] }>;
  capturePreview: (viewId: string) => Promise<{ png: Buffer; width: number; height: number }>;
  recordRevision: (entry: RevisionEntry) => void;
  ask: (
    request:
      | { kind: 'examples'; prompt: string }
      | { kind: 'question'; prompt: string; choices?: string[] }
      | {
          kind: 'screenshot';
          prompt: string;
          screenshot: { dataUrl: string; width: number; height: number };
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
];
const MAX_RELAYED_MESSAGE = 500;

/** Diagnostics as sent to the agent: failures and the render-ok signal, trimmed. */
export function relayableDiagnostics(diagnostics: Diagnostic[]) {
  return diagnostics
    .filter((d) => RELAYED_KINDS.includes(d.kind))
    .map((d) => ({
      kind: d.kind,
      message:
        d.message.length > MAX_RELAYED_MESSAGE
          ? `${d.message.slice(0, MAX_RELAYED_MESSAGE)}…`
          : d.message,
      ...(d.location ? { location: d.location } : {}),
      ...(d.method ? { method: d.method } : {}),
      ...(d.code ? { code: d.code } : {}),
      ...(d.params ? { params: d.params } : {}),
    }));
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
    status: 'previewing',
    summary: 'Previewing…',
    ts: Date.now(),
  });
  let outcome: { status: 'ok' | 'failed' | 'timeout'; diagnostics: Diagnostic[] };
  try {
    outcome = await deps.previewAndWait(deps.viewId, {
      manifest: input.manifest,
      files: input.files,
    });
  } catch (err) {
    // writeDraft validation: bad file names, missing View.jsx, oversized files.
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
  return text({ status: outcome.status, diagnostics: relayableDiagnostics(outcome.diagnostics) });
}

export function screenshotPrompt(input: { reason?: string } | null) {
  return (input && input.reason) || 'The agent would like to see the preview.';
}

async function requestScreenshot(deps: ToolDeps, input: { reason?: string }) {
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
