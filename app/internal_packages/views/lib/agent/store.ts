import fs from 'fs';
import path from 'path';
import MailspringStore from 'mailspring-store';
import { FeatureUsageStore, IdentityStore, localized } from 'mailspring-exports';
import { ViewAuthoring, openView } from '../authoring';
import { hostsFor } from '../authoring/hosts';
import { installedViews } from '../view-registry';
import { AgentClient, AgentTransport } from './client';
import { chipFor, examplesForThreads } from './examples';
import {
  AccountUsage,
  LimitNotice,
  QuotaDetails,
  exhaustedNotice,
  limitNotice,
  parseUsage,
  raiseStepCents,
} from './quota';
import {
  runClientTool,
  screenshotNote,
  screenshotPrompt,
  RevisionWait,
  ToolDeps,
  ToolResult,
} from './tools';
import {
  AgentAPIError,
  AgentEvent,
  AgentSessionState,
  Example,
  PendingRequest,
  RequestKind,
  RevisionEntry,
  ToolContent,
  ToolResultSummary,
  TranscriptEntry,
} from './types';

/**
 * State of every View the user is building with the hosted agent, and the actions the
 * floating authoring panel calls. One Managed Agents session exists per View on the backend;
 * this store mirrors its event stream, runs the agent's client tools, and holds the examples
 * the user has staged but not yet sent.
 */

const REVISIONS_CONFIG_KEY = 'core.views.agentRevisions';
const PUBLIC_KEY_CONFIG_KEY = 'core.views.agentPublicKey';
const SCREENSHOT_MAX_WIDTH = 1280;
// A View that just mounted is often still loading its data. Before showing the user a
// screenshot to approve, wait until consecutive captures stop changing (or give up).
const SETTLE_INTERVAL_MS = 400;
const SETTLE_STABLE_FRAMES = 2;
const SETTLE_CAP_MS = 8000;
// How long a screenshot request waits for the latest revision to finish previewing.
const REVISION_WAIT_CAP_MS = 10000;

type Shot = { png: Buffer; width: number; height: number };

/**
 * The View's pixels right now, read from its host. This deliberately skips
 * captureViewPreview's `screenshot-taken` diagnostic: settling and the live thumbnail capture
 * repeatedly and keep everything local; only the image the user approves is recorded.
 */
async function captureQuietly(viewId: string): Promise<Shot | null> {
  const host = hostsFor(viewId)[0];
  let image = host ? await host.capturePage() : null;
  if (!image || image.isEmpty()) return null;
  if (image.getSize().width > SCREENSHOT_MAX_WIDTH) {
    image = image.resize({ width: SCREENSHOT_MAX_WIDTH, quality: 'good' });
  }
  const { width, height } = image.getSize();
  return { png: image.toPNG(), width, height };
}

async function captureSettled(viewId: string): Promise<Shot> {
  const deadline = Date.now() + SETTLE_CAP_MS;
  let last: Shot | null = null;
  let stable = 0;
  while (Date.now() < deadline) {
    const shot = await captureQuietly(viewId);
    if (shot && last && shot.png.equals(last.png)) {
      stable += 1;
      if (stable >= SETTLE_STABLE_FRAMES) break;
    } else {
      stable = 0;
    }
    if (shot) last = shot;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
  }
  if (!last) throw new Error(`View "${viewId}" isn't on screen.`);
  return last;
}

const UPGRADE_ICON = 'mailspring://composer-grammar-check/assets/ic-modal-image@2x.png';

export interface AgentStoreDeps {
  transport: AgentTransport;
  identityId: () => string;
  configuredPublicKey: () => string | null;
  devMode: () => boolean;
  lastAcceptedRevision: (viewId: string) => number;
  setAcceptedRevision: (viewId: string, revision: number) => void;
  buildExamples: (threadIds: string[]) => Promise<Example[]>;
  currentBundle: (viewId: string) => { manifest: object; files: { [name: string]: string } } | null;
  previewAndWait: ToolDeps['previewAndWait'];
  capturePreview: ToolDeps['capturePreview'];
  /** A capture of the View as it looks now, or null when it isn't on screen. */
  captureNow: (viewId: string) => Promise<Shot | null>;
  /** The capture the user approved, recorded in the View's diagnostics. */
  captureForSend: (viewId: string) => Promise<Shot | null>;
  promoteDraft: (viewId: string) => void;
  discardDraft: (viewId: string) => void;
  /** Offers Pro after a free-plan limit (Pro users only get the inline notice). */
  showUpgrade: (notice: LimitNotice) => void;
}

function readBundle(viewId: string) {
  const view = installedViews().find((v) => v.id === viewId);
  if (!view) return null;
  const files: { [name: string]: string } = {};
  for (const name of fs.readdirSync(view.dir)) {
    if (name === 'manifest.json') continue;
    const file = path.join(view.dir, name);
    if (fs.statSync(file).isFile()) files[name] = fs.readFileSync(file, 'utf8');
  }
  return { manifest: view.json, files };
}

function defaultDeps(): AgentStoreDeps {
  return {
    transport: new AgentClient(),
    identityId: () => (IdentityStore.identity() || { id: '' }).id,
    configuredPublicKey: () => AppEnv.config.get(PUBLIC_KEY_CONFIG_KEY) || null,
    devMode: () => AppEnv.inDevMode(),
    lastAcceptedRevision: (viewId) => (AppEnv.config.get(REVISIONS_CONFIG_KEY) || {})[viewId] || 0,
    setAcceptedRevision: (viewId, revision) => {
      const all = { ...(AppEnv.config.get(REVISIONS_CONFIG_KEY) || {}) };
      all[viewId] = revision;
      AppEnv.config.set(REVISIONS_CONFIG_KEY, all);
    },
    buildExamples: examplesForThreads,
    currentBundle: readBundle,
    previewAndWait: (viewId, revision) => ViewAuthoring.previewAndWait(viewId, revision),
    capturePreview: async (viewId) => {
      openView(viewId);
      return captureSettled(viewId);
    },
    captureNow: captureQuietly,
    captureForSend: async (viewId) => {
      try {
        return await ViewAuthoring.captureViewPreview(viewId, { maxWidth: SCREENSHOT_MAX_WIDTH });
      } catch {
        return null;
      }
    },
    promoteDraft: (viewId) => ViewAuthoring.promoteDraft(viewId),
    discardDraft: (viewId) => ViewAuthoring.discardDraft(viewId),
    showUpgrade: (notice) => {
      const feature = notice.kind === 'build' ? 'view-agent-build' : 'view-agent-spend';
      FeatureUsageStore.displayUpgradeModal(notice.details.feature || feature, {
        headerText: '',
        rechargeText: notice.message,
        iconUrl: UPGRADE_ICON,
      }).catch(() => {});
    },
  };
}

function screenshotOf(shot: Shot) {
  return {
    dataUrl: `data:image/png;base64,${shot.png.toString('base64')}`,
    width: shot.width,
    height: shot.height,
    capturedAt: Date.now(),
  };
}

/** The user's side of a request, as one line in the chat. */
export function responseText(summary: ToolResultSummary) {
  if (summary.skipped) return localized('Skipped');
  if (summary.declined) return localized("Didn't send the screenshot");
  if (summary.screenshot) return localized('Sent a screenshot');
  if (typeof summary.answer === 'string') return summary.answer;
  if (typeof summary.examples === 'number') {
    return summary.examples === 1
      ? localized('Shared 1 example')
      : localized('Shared %@ examples', summary.examples);
  }
  return localized('Answered');
}

/** A View id from a name: a slug plus a short random suffix so names can repeat. */
export function newViewId(name: string) {
  const slug = (name || 'view')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug || 'view'}-${suffix}`;
}

interface PendingAsk {
  request: PendingRequest;
  resolve: (result: ToolResult) => void;
}

interface SessionRuntime {
  abort: AbortController | null;
  seenEventIds: Set<string>;
  handledToolUseIds: Set<string>;
  /** Full payloads for the chips in `attachedExamples`, keyed by messageId. */
  staged: Map<string, Example>;
  asks: PendingAsk[];
  publicKey: string | null;
  refreshing: boolean;
  /**
   * Set when the backend has no usable session for the View: `none` for a View never built
   * with the agent (a starter or hand-written View), `outdated` for one built with an agent
   * version the backend no longer serves. The next message starts a fresh session seeded
   * with the View's current code instead of being sent to the old one. `fresh` is the user
   * choosing to replace a session that reached its turn limit.
   */
  needsSession: 'none' | 'outdated' | 'fresh' | null;
  /** The message a generic `rate_limited` refused, for Retry to send again. */
  unsent: string | null;
  /** preview_revision calls still running, including signature checks before the preview. */
  previewsRunning: number;
}

let localIds = 0;
const localId = (prefix: string) => `local-${prefix}-${Date.now()}-${(localIds += 1)}`;

class AgentSessionStoreImpl extends MailspringStore {
  private sessions = new Map<string, AgentSessionState>();
  private runtimes = new Map<string, SessionRuntime>();
  private active: string | null = null;
  private deps: AgentStoreDeps = null;
  private usage: AccountUsage | null = null;
  private usageRequest: Promise<AccountUsage | null> | null = null;

  /** Replaces the store's collaborators; used by specs. Clears all sessions. */
  configure(deps: Partial<AgentStoreDeps>) {
    for (const viewId of [...this.runtimes.keys()]) this.stopStream(viewId);
    this.sessions.clear();
    this.runtimes.clear();
    this.active = null;
    this.usage = null;
    this.usageRequest = null;
    this.deps = { ...defaultDeps(), ...deps };
  }

  private get d() {
    if (!this.deps) this.deps = defaultDeps();
    return this.deps;
  }

  session(viewId: string) {
    return this.sessions.get(viewId) || null;
  }

  activeViewId() {
    return this.active;
  }

  activeSession() {
    return this.active ? this.session(this.active) : null;
  }

  /** The account's allowance from the last `/usage` fetch, or null before one succeeds. */
  accountUsage() {
    return this.usage;
  }

  /**
   * Fetches the account's allowance. Concurrent calls share one request, and failures (offline,
   * signed out) keep the last known value: the meter is informational and the backend enforces.
   */
  refreshUsage(): Promise<AccountUsage | null> {
    if (this.usageRequest) return this.usageRequest;
    this.usageRequest = (async () => {
      try {
        const next = parseUsage(await this.d.transport.usage());
        if (next) {
          this.usage = next;
          this.trigger();
        }
      } catch {
        // Keep the last known allowance.
      } finally {
        this.usageRequest = null;
      }
      return this.usage;
    })();
    return this.usageRequest;
  }

  // ── State plumbing ─────────────────────────────────────────────────────────

  private runtime(viewId: string) {
    let rt = this.runtimes.get(viewId);
    if (!rt) {
      rt = {
        abort: null,
        seenEventIds: new Set(),
        handledToolUseIds: new Set(),
        staged: new Map(),
        asks: [],
        publicKey: null,
        refreshing: false,
        needsSession: null,
        unsent: null,
        previewsRunning: 0,
      };
      this.runtimes.set(viewId, rt);
    }
    return rt;
  }

  private ensure(viewId: string, name: string) {
    let s = this.sessions.get(viewId);
    if (!s) {
      s = {
        viewId,
        name,
        status: 'connecting',
        working: false,
        transcript: [],
        pendingRequest: null,
        attachedExamples: [],
        revisions: [],
        usage: null,
        limit: null,
        error: null,
      };
      this.sessions.set(viewId, s);
    } else if (name && s.name !== name) {
      s = { ...s, name };
      this.sessions.set(viewId, s);
    }
    this.runtime(viewId);
    return s;
  }

  private update(viewId: string, fn: (s: AgentSessionState) => Partial<AgentSessionState>) {
    const s = this.sessions.get(viewId);
    if (!s) return;
    this.sessions.set(viewId, { ...s, ...fn(s) });
    this.trigger();
  }

  /**
   * Handles the backend refusing a message the user just sent: the generic rate limit, the
   * message length cap and the chat's turn limit. The optimistic transcript entry is taken
   * back and its examples restaged, so nothing the user wrote is lost. Returns false for any
   * other error, which the caller passes to fail().
   */
  private refused(
    viewId: string,
    err: any,
    sent: { entryId: string | null; text: string; examples: Example[] }
  ) {
    const code = err instanceof AgentAPIError ? err.code : null;
    if (code !== 'rate_limited' && code !== 'message_too_long' && code !== 'session_turn_limit') {
      return false;
    }
    const rt = this.runtime(viewId);
    for (const example of sent.examples) rt.staged.set(example.messageId, example);
    const details = (err.details as { limit?: number }) || {};
    this.update(viewId, (s) => {
      const transcript = sent.entryId
        ? s.transcript.filter((entry) => entry.id !== sent.entryId)
        : s.transcript;
      const next: Partial<AgentSessionState> = {
        status: s.status === 'connecting' || s.status === 'error' ? 'idle' : s.status,
        working: false,
        error: null,
        transcript,
        attachedExamples: [...rt.staged.values()].map(chipFor),
      };
      if (code === 'rate_limited') {
        rt.unsent = sent.text;
        next.notice = {
          code,
          action: 'retry',
          message: err.message || localized('Too many requests. Please try again later.'),
        };
      } else {
        next.returnedDraft = { text: sent.text, seq: (s.returnedDraft?.seq || 0) + 1 };
        if (code === 'message_too_long') {
          if (typeof details.limit === 'number') next.messageLimit = details.limit;
        } else {
          next.notice = {
            code,
            action: 'start_fresh',
            message:
              err.message ||
              localized(
                "This View's chat has reached its message limit. Start a fresh chat to keep improving it."
              ),
          };
        }
      }
      return next;
    });
    return true;
  }

  private fail(viewId: string, err: any) {
    const code = err instanceof AgentAPIError ? err.code : 'unknown';
    if (code === 'rate_limited') {
      // Deliberately generic: the backend gives no reason, and neither does the panel.
      this.update(viewId, (s) => ({
        status: s.status === 'connecting' || s.status === 'error' ? 'idle' : s.status,
        working: false,
        error: null,
        notice: {
          code,
          action: 'retry',
          message: err.message || localized('Too many requests. Please try again later.'),
        },
      }));
      return;
    }
    if (code === 'no_session' || code === 'session_outdated') {
      this.markNeedsSession(viewId, code === 'no_session' ? 'none' : 'outdated');
      return;
    }
    const notice = limitNotice(code, (err.details as QuotaDetails) || {});
    if (notice) {
      this.showLimit(viewId, notice);
      this.refreshUsage();
      return;
    }
    this.update(viewId, () => ({
      status: 'error',
      working: false,
      error: { code, message: err.message || String(err) },
    }));
  }

  /**
   * A limit isn't an error: the session (if any) is fine, the account is out of allowance. The
   * panel shows the notice inline; free users are also offered Pro.
   */
  private showLimit(viewId: string, notice: LimitNotice) {
    this.update(viewId, (s) => ({
      status: s.status === 'connecting' ? 'idle' : s.status,
      working: false,
      error: null,
      limit: notice,
    }));
    if (notice.canUpgrade) this.d.showUpgrade(notice);
  }

  private markNeedsSession(viewId: string, reason: 'none' | 'outdated') {
    const rt = this.runtime(viewId);
    const first = rt.needsSession !== reason;
    rt.needsSession = reason;
    this.update(viewId, (s) => ({
      status: 'idle',
      working: false,
      error: null,
      transcript:
        reason === 'outdated' && first
          ? [
              ...s.transcript,
              {
                id: localId('outdated'),
                role: 'system',
                text: localized(
                  'This View was built with an older assistant. Your next message starts a fresh session with its current code.'
                ),
                ts: Date.now(),
              },
            ]
          : s.transcript,
    }));
  }

  // ── Event stream ───────────────────────────────────────────────────────────

  private openStream(viewId: string) {
    const rt = this.runtime(viewId);
    if (rt.abort) return Promise.resolve();
    const abort = new AbortController();
    rt.abort = abort;
    return new Promise<void>((resolve, reject) => {
      let opened = false;
      this.d.transport
        .streamEvents(
          viewId,
          (event) => this.onEvent(viewId, event),
          abort.signal,
          () => {
            opened = true;
            // The View has a live server session after all, so messages go to it directly.
            rt.needsSession = null;
            this.update(viewId, (s) => ({
              status: s.status === 'connecting' || s.status === 'error' ? 'idle' : s.status,
              error: null,
            }));
            resolve();
          }
        )
        .catch((err) => {
          if (rt.abort === abort) rt.abort = null;
          this.fail(viewId, err);
          if (!opened) reject(err);
        })
        .then(() => {
          if (!opened) resolve();
        });
    });
  }

  private stopStream(viewId: string) {
    const rt = this.runtimes.get(viewId);
    if (rt && rt.abort) {
      rt.abort.abort();
      rt.abort = null;
    }
  }

  /** Applies one stream event. Public for specs; events are deduped by id. */
  onEvent(viewId: string, event: AgentEvent & { [key: string]: any }) {
    const rt = this.runtime(viewId);
    if (event.id) {
      if (rt.seenEventIds.has(event.id)) return;
      rt.seenEventIds.add(event.id);
    }
    switch (event.type) {
      case 'status':
        this.update(viewId, () => ({
          status: event.status,
          working: event.status === 'running',
        }));
        if (event.status !== 'running') this.refreshUsage();
        return;
      case 'thinking':
        this.update(viewId, () => ({ working: true }));
        return;
      case 'message':
        this.update(viewId, (s) => ({
          transcript: [
            ...s.transcript,
            { id: event.id, role: 'agent', text: event.text, ts: Date.now() },
          ],
        }));
        return;
      case 'user_message':
        this.onUserMessageEcho(viewId, event);
        return;
      case 'usage':
        this.update(viewId, () => ({
          usage: { listCostCents: event.listCostCents, maxListCostCents: event.maxListCostCents },
        }));
        return;
      case 'error':
        this.update(viewId, () => ({ error: { code: event.code, message: event.message } }));
        return;
      case 'tool_request':
        if (event.resolved) {
          this.replayRequest(viewId, event);
          return;
        }
        if (rt.handledToolUseIds.has(event.toolUseId)) return;
        rt.handledToolUseIds.add(event.toolUseId);
        this.runTool(viewId, event);
        return;
      case 'tool_result':
        this.replayResult(viewId, event);
        return;
      default:
        return;
    }
  }

  // ── Transcript ─────────────────────────────────────────────────────────────

  /** Appends an entry, or replaces the one with the same id in place (keeping its position). */
  private upsertEntry(viewId: string, entry: TranscriptEntry) {
    this.update(viewId, (s) => {
      const idx = s.transcript.findIndex((t) => t.id === entry.id);
      if (idx === -1) return { transcript: [...s.transcript, entry] };
      const transcript = [...s.transcript];
      transcript[idx] = { ...transcript[idx], ...entry, ts: transcript[idx].ts };
      return { transcript };
    });
  }

  private hasEntry(viewId: string, id: string) {
    const s = this.session(viewId);
    return !!s && s.transcript.some((t) => t.id === id);
  }

  private addRequestEntry(viewId: string, toolUseId: string, kind: RequestKind, prompt: string) {
    if (this.hasEntry(viewId, `req-${toolUseId}`)) return;
    this.upsertEntry(viewId, {
      id: `req-${toolUseId}`,
      kind: 'request',
      role: 'agent',
      text: prompt,
      toolUseId,
      requestKind: kind,
      ts: Date.now(),
    });
  }

  private addResponseEntry(
    viewId: string,
    toolUseId: string,
    entry: Pick<TranscriptEntry, 'text'> & Partial<TranscriptEntry>
  ) {
    if (this.hasEntry(viewId, `resp-${toolUseId}`)) return;
    this.upsertEntry(viewId, {
      id: `resp-${toolUseId}`,
      kind: 'response',
      role: 'user',
      toolUseId,
      ts: Date.now(),
      ...entry,
    });
  }

  // A resolved request replayed after a relaunch or reconnect: shown, never re-run.
  private replayRequest(viewId: string, event: Extract<AgentEvent, { type: 'tool_request' }>) {
    const input = event.input || {};
    switch (event.name) {
      case 'request_examples':
        this.addRequestEntry(viewId, event.toolUseId, 'examples', String(input.prompt || ''));
        return;
      case 'ask_user':
        this.addRequestEntry(viewId, event.toolUseId, 'question', String(input.question || ''));
        return;
      case 'request_screenshot':
        this.addRequestEntry(viewId, event.toolUseId, 'screenshot', screenshotPrompt(input));
        return;
      case 'preview_revision':
        if (typeof input.revision !== 'number') return;
        if (this.hasEntry(viewId, `rev-${input.revision}`)) return;
        this.recordRevision(
          viewId,
          { revision: input.revision, status: 'unknown', summary: '', ts: Date.now() },
          event.toolUseId
        );
        return;
      default:
        return;
    }
  }

  // How the user answered a request, replayed by the backend. Entries this client already
  // created while the request was open win, since they carry the chips and thumbnail.
  private replayResult(viewId: string, event: Extract<AgentEvent, { type: 'tool_result' }>) {
    const s = this.session(viewId);
    if (!s) return;
    const summary: ToolResultSummary = event.summary || {};
    const revision = s.transcript.find(
      (t) => t.kind === 'revision' && t.toolUseId === event.toolUseId
    );
    if (revision && revision.revision) {
      if (summary.status && revision.revision.status === 'unknown') {
        this.recordRevision(
          viewId,
          { ...revision.revision, status: summary.status },
          event.toolUseId
        );
      }
      return;
    }
    if (!this.hasEntry(viewId, `req-${event.toolUseId}`)) return;
    this.addResponseEntry(viewId, event.toolUseId, { text: responseText(summary) });
  }

  // The backend echoes the user's own turns so a relaunched client can rebuild its
  // transcript; while this client is running, those echoes replace the optimistic entries.
  private onUserMessageEcho(viewId: string, event: { id: string; text: string }) {
    this.update(viewId, (s) => {
      const idx = s.transcript.findIndex(
        (t) => t.role === 'user' && t.id.startsWith('local-') && t.text === event.text
      );
      if (idx !== -1) {
        const transcript = [...s.transcript];
        transcript[idx] = { ...transcript[idx], id: event.id };
        return { transcript };
      }
      return {
        transcript: [
          ...s.transcript,
          { id: event.id, role: 'user', text: event.text, ts: Date.now() },
        ],
      };
    });
  }

  // ── Client tools ───────────────────────────────────────────────────────────

  private async publicKey(viewId: string) {
    const configured = this.d.configuredPublicKey();
    if (configured) return configured;
    if (!this.d.devMode()) return null;
    const rt = this.runtime(viewId);
    if (!rt.publicKey) rt.publicKey = await this.d.transport.publicKey();
    return rt.publicKey;
  }

  private toolDeps(viewId: string, toolUseId: string): ToolDeps {
    return {
      viewId,
      identityId: this.d.identityId,
      publicKey: () => this.publicKey(viewId),
      lastAcceptedRevision: this.d.lastAcceptedRevision,
      setAcceptedRevision: this.d.setAcceptedRevision,
      previewAndWait: this.d.previewAndWait,
      capturePreview: this.d.capturePreview,
      waitForLatestRevision: () => this.waitForLatestRevision(viewId),
      recordRevision: (entry) => this.recordRevision(viewId, entry, toolUseId),
      ask: (request) =>
        new Promise<ToolResult>((resolve) => {
          const rt = this.runtime(viewId);
          rt.asks.push({ request: { toolUseId, ...request }, resolve });
          this.addRequestEntry(viewId, toolUseId, request.kind, request.prompt);
          this.syncPendingRequest(viewId);
        }),
    };
  }

  /** The most recently recorded revision's outcome; recency, not number, since a replaced
   * session numbers its revisions from 1 again. */
  private latestRevisionWait(viewId: string): RevisionWait {
    if (this.runtime(viewId).previewsRunning > 0) return 'still-previewing';
    const s = this.session(viewId);
    const latest = s && [...s.revisions].sort((a, b) => b.ts - a.ts)[0];
    if (!latest) return 'none';
    if (latest.status === 'previewing') return 'still-previewing';
    return latest.status === 'ok' ? 'ok' : 'failed';
  }

  private waitForLatestRevision(viewId: string): Promise<RevisionWait> {
    const now = this.latestRevisionWait(viewId);
    if (now !== 'still-previewing') return Promise.resolve(now);
    return new Promise((resolve) => {
      let unlisten: () => void = null;
      const finish = (result: RevisionWait) => {
        clearTimeout(timer);
        if (unlisten) unlisten();
        resolve(result);
      };
      const timer = setTimeout(() => finish(this.latestRevisionWait(viewId)), REVISION_WAIT_CAP_MS);
      unlisten = this.listen(() => {
        const state = this.latestRevisionWait(viewId);
        if (state !== 'still-previewing') finish(state);
      });
    });
  }

  // Revisions are transcript entries so each sits where it happened in the chat; the first
  // record of a revision fixes its position and later ones update it in place.
  private recordRevision(viewId: string, entry: RevisionEntry, toolUseId?: string) {
    this.update(viewId, (s) => {
      const revisions = s.revisions.filter((r) => r.revision !== entry.revision);
      return { revisions: [...revisions, entry].sort((a, b) => a.revision - b.revision) };
    });
    this.upsertEntry(viewId, {
      id: `rev-${entry.revision}`,
      kind: 'revision',
      role: 'system',
      text: entry.summary || '',
      revision: entry,
      ...(toolUseId ? { toolUseId } : {}),
      ts: entry.ts || Date.now(),
    });
  }

  private syncPendingRequest(viewId: string) {
    const rt = this.runtime(viewId);
    this.update(viewId, () => ({ pendingRequest: rt.asks.length ? rt.asks[0].request : null }));
  }

  private async runTool(viewId: string, event: Extract<AgentEvent, { type: 'tool_request' }>) {
    const rt = this.runtime(viewId);
    const isPreview = event.name === 'preview_revision';
    if (isPreview) rt.previewsRunning += 1;
    let result: ToolResult;
    try {
      result = await runClientTool(
        this.toolDeps(viewId, event.toolUseId),
        event.name,
        event.input,
        event.signature
      );
    } catch (err) {
      result = { content: [{ type: 'text', text: `Client error: ${err.message}` }], isError: true };
    } finally {
      if (isPreview) {
        rt.previewsRunning -= 1;
        this.trigger();
      }
    }
    try {
      await this.d.transport.sendToolResult(viewId, {
        toolUseId: event.toolUseId,
        content: result.content,
        isError: result.isError,
      });
    } catch (err) {
      this.fail(viewId, err);
    }
  }

  /** Resolves the open request of `kind`. Returns its tool-use id, or null if none was open. */
  private answer(viewId: string, kind: PendingRequest['kind'], result: ToolResult) {
    const rt = this.runtime(viewId);
    const ask = rt.asks[0];
    if (!ask || ask.request.kind !== kind) return null;
    rt.asks.shift();
    this.syncPendingRequest(viewId);
    ask.resolve(result);
    return ask.request.toolUseId;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async start({
    viewId,
    name,
    request,
    examples = [],
    echo = true,
  }: {
    viewId: string;
    name: string;
    request: string;
    examples?: string[];
    /** False when the caller already added the user's turn to the transcript. */
    echo?: boolean;
  }) {
    this.ensure(viewId, name);
    this.setActive(viewId);
    const rt = this.runtime(viewId);
    const entryId = echo ? localId('user') : null;
    this.update(viewId, (s) => ({
      status: 'connecting',
      working: true,
      error: null,
      limit: null,
      notice: null,
      intro: null,
      transcript: entryId
        ? [...s.transcript, { id: entryId, role: 'user', text: request, ts: Date.now() }]
        : s.transcript,
    }));
    let all: Example[] = [];
    try {
      const built = examples.length ? await this.d.buildExamples(examples) : [];
      all = [...rt.staged.values(), ...built];
      rt.staged.clear();
      this.update(viewId, (s) => {
        const transcript = [...s.transcript];
        const last = transcript[transcript.length - 1];
        if (last && all.length)
          transcript[transcript.length - 1] = { ...last, attachments: all.map(chipFor) };
        return { transcript, attachedExamples: [] };
      });
      const current = this.d.currentBundle(viewId);
      const created = await this.d.transport.createSession({
        viewId,
        name,
        request,
        examples: all,
        ...(current ? { current } : {}),
        ...(rt.needsSession === 'fresh' ? { fresh: true } : {}),
      });
      rt.needsSession = null;
      rt.unsent = null;
      // A new session numbers its revisions from 1 again. Replay protection still holds
      // within the session; across sessions the signature already binds identity and View.
      if (!created.resumed) this.d.setAcceptedRevision(viewId, 0);
      await this.openStream(viewId);
    } catch (err) {
      if (!this.refused(viewId, err, { entryId, text: request, examples: all })) {
        this.fail(viewId, err);
      }
    }
  }

  /** Sends the message a `rate_limited` refused, or reattaches if nothing was being sent. */
  async retry(viewId: string) {
    const rt = this.runtime(viewId);
    const text = rt.unsent;
    rt.unsent = null;
    this.update(viewId, () => ({ notice: null }));
    if (text || rt.staged.size) {
      await this.sendMessage(viewId, text || '');
      return;
    }
    try {
      await this.openStream(viewId);
    } catch {
      // fail() already recorded the outcome.
    }
  }

  /**
   * After `session_turn_limit`, the user's next message starts a new session for the same
   * View, seeded with its current code. The old chat stays in the transcript above.
   */
  startFresh(viewId: string) {
    const rt = this.runtime(viewId);
    rt.needsSession = 'fresh';
    this.update(viewId, (s) => ({
      notice: null,
      transcript: [
        ...s.transcript,
        {
          id: localId('fresh'),
          role: 'system',
          text: localized("Your next message starts a fresh chat with this View's current code."),
          ts: Date.now(),
        },
      ],
    }));
  }

  /**
   * Reattaches to the View's existing session without sending anything. Rejects with an
   * AgentAPIError whose code is `no_session` when the View has never had one.
   */
  async resume(viewId: string, name: string) {
    this.ensure(viewId, name);
    this.setActive(viewId);
    try {
      await this.openStream(viewId);
    } catch (err) {
      // An outdated session is replaced on the user's next message; nothing to report now.
      if (!(err instanceof AgentAPIError && err.code === 'session_outdated')) throw err;
    }
  }

  setActive(viewId: string | null) {
    this.active = viewId;
    this.trigger();
    if (viewId) this.refreshUsage();
  }

  /**
   * Shows the panel for a View without contacting the backend: the `try` card for a starter
   * being previewed, or an empty `edit` composer. A session the user already talked to keeps
   * its transcript. Nothing is created until the first message, which goes through start(),
   * since the View may never have had a session (the backend resumes one if it does).
   */
  preview(viewId: string, name: string, intro: 'try' | 'edit') {
    const existing = this.session(viewId);
    this.ensure(viewId, name);
    const rt = this.runtime(viewId);
    if (!rt.abort && (!existing || isUntouched(existing))) {
      rt.needsSession = rt.needsSession || 'none';
      this.update(viewId, () => ({ status: 'idle', working: false, error: null, intro }));
    }
    this.setActive(viewId);
  }

  /**
   * Moves a View from its intro to the composer. Attaches to the View's server session if it
   * has one, which replays its history; a `no_session` answer leaves the next message to
   * start one. Reading the stream never creates a session.
   */
  async chat(viewId: string) {
    this.update(viewId, () => ({ intro: 'edit' }));
    try {
      await this.openStream(viewId);
    } catch {
      // fail() already recorded no_session / session_outdated (or surfaced the error).
    }
  }

  async sendMessage(viewId: string, text: string) {
    const rt = this.runtime(viewId);
    const examples = [...rt.staged.values()];
    const trimmed = (text || '').trim();
    if (!trimmed && !examples.length) return;
    if (rt.needsSession) {
      const s = this.session(viewId);
      await this.start({
        viewId,
        name: s ? s.name : viewId,
        request: trimmed || localized('Continue improving this View'),
      });
      return;
    }
    rt.staged.clear();
    rt.unsent = null;
    const entryId = localId('user');
    this.update(viewId, (s) => ({
      working: true,
      limit: null,
      notice: null,
      attachedExamples: [],
      transcript: [
        ...s.transcript,
        {
          id: entryId,
          role: 'user',
          text: trimmed,
          ...(examples.length ? { attachments: examples.map(chipFor) } : {}),
          ts: Date.now(),
        },
      ],
    }));
    try {
      await this.d.transport.sendMessage(viewId, {
        text: trimmed,
        ...(examples.length ? { examples } : {}),
      });
      await this.openStream(viewId);
    } catch (err) {
      if (err instanceof AgentAPIError && err.code === 'session_outdated') {
        // The user's turn is already in the transcript; start over with it.
        rt.needsSession = 'outdated';
        for (const example of examples) rt.staged.set(example.messageId, example);
        const s = this.session(viewId);
        await this.start({ viewId, name: s ? s.name : viewId, request: trimmed, echo: false });
        return;
      }
      if (!this.refused(viewId, err, { entryId, text: trimmed, examples })) this.fail(viewId, err);
    }
  }

  async attachThreads(viewId: string, threadIds: string[]) {
    const rt = this.runtime(viewId);
    const fresh = threadIds.filter((id) => ![...rt.staged.values()].some((e) => e.threadId === id));
    if (!fresh.length) return;
    try {
      const examples = await this.d.buildExamples(fresh);
      for (const example of examples) rt.staged.set(example.messageId, example);
      this.update(viewId, () => ({ attachedExamples: [...rt.staged.values()].map(chipFor) }));
    } catch (err) {
      this.update(viewId, () => ({ error: { code: 'examples', message: err.message } }));
    }
  }

  removeAttachment(viewId: string, messageId: string) {
    const rt = this.runtime(viewId);
    rt.staged.delete(messageId);
    this.update(viewId, () => ({ attachedExamples: [...rt.staged.values()].map(chipFor) }));
  }

  submitExamples(viewId: string) {
    const rt = this.runtime(viewId);
    const examples = [...rt.staged.values()];
    const toolUseId = this.answer(viewId, 'examples', {
      content: [{ type: 'text', text: JSON.stringify({ examples }) }],
    });
    if (!toolUseId) return;
    rt.staged.clear();
    this.update(viewId, () => ({ attachedExamples: [] }));
    this.addResponseEntry(viewId, toolUseId, {
      text: responseText({ examples: examples.length }),
      attachments: examples.map(chipFor),
    });
  }

  skipExamples(viewId: string) {
    const toolUseId = this.answer(viewId, 'examples', {
      content: [{ type: 'text', text: JSON.stringify({ skipped: true }) }],
    });
    if (toolUseId)
      this.addResponseEntry(viewId, toolUseId, { text: responseText({ skipped: true }) });
  }

  answerQuestion(viewId: string, answer: string) {
    const toolUseId = this.answer(viewId, 'question', {
      content: [{ type: 'text', text: answer }],
    });
    if (toolUseId) this.addResponseEntry(viewId, toolUseId, { text: answer });
  }

  /**
   * Recaptures the View for an open screenshot request, so the thumbnail the user is asked
   * about tracks the View as it finishes loading. Keeps the last image when the View isn't on
   * screen.
   */
  async refreshScreenshot(viewId: string) {
    const rt = this.runtime(viewId);
    const s = this.session(viewId);
    if (rt.refreshing || !s || !s.pendingRequest || s.pendingRequest.kind !== 'screenshot') return;
    const toolUseId = s.pendingRequest.toolUseId;
    rt.refreshing = true;
    try {
      const shot = await this.d.captureNow(viewId);
      if (shot) this.setPendingScreenshot(viewId, toolUseId, shot);
    } catch {
      // Keep showing the previous capture.
    } finally {
      rt.refreshing = false;
    }
  }

  private setPendingScreenshot(viewId: string, toolUseId: string, shot: Shot) {
    const rt = this.runtime(viewId);
    const ask = rt.asks[0];
    if (!ask || ask.request.toolUseId !== toolUseId) return;
    ask.request = {
      ...ask.request,
      screenshot: { ...screenshotOf(shot), note: screenshotNote(this.latestRevisionWait(viewId)) },
    };
    this.syncPendingRequest(viewId);
  }

  // Sends the View as it looks when the user clicks, not the capture taken when the request
  // arrived; the pending thumbnail is only the fallback if the View is off screen.
  async approveScreenshot(viewId: string) {
    const s = this.session(viewId);
    const pending = s && s.pendingRequest;
    if (!pending || pending.kind !== 'screenshot') return;
    let shot: { dataUrl: string; width: number; height: number } = pending.screenshot;
    try {
      const fresh = await this.d.captureForSend(viewId);
      if (fresh) shot = screenshotOf(fresh);
    } catch {
      // Fall back to the last capture the user saw.
    }
    if (!shot) return;
    const content: ToolContent[] = [
      {
        type: 'image',
        mediaType: 'image/png',
        dataBase64: shot.dataUrl.replace(/^data:image\/png;base64,/, ''),
      },
    ];
    const toolUseId = this.answer(viewId, 'screenshot', { content });
    if (toolUseId) {
      this.addResponseEntry(viewId, toolUseId, {
        text: responseText({ screenshot: true }),
        thumbnail: shot.dataUrl,
      });
    }
  }

  declineScreenshot(viewId: string) {
    const toolUseId = this.answer(viewId, 'screenshot', {
      content: [{ type: 'text', text: 'declined' }],
    });
    if (toolUseId)
      this.addResponseEntry(viewId, toolUseId, { text: responseText({ declined: true }) });
  }

  async interrupt(viewId: string) {
    try {
      await this.d.transport.interrupt(viewId);
    } catch (err) {
      this.fail(viewId, err);
    }
  }

  async raiseBudget(viewId: string) {
    // Nothing left to raise into: say so rather than ask the backend to refuse.
    if (this.usage && raiseStepCents(this.usage) === 0) {
      const notice = exhaustedNotice(this.usage, 'spend');
      if (notice) {
        this.showLimit(viewId, notice);
        return;
      }
    }
    try {
      const { maxListCostCents } = await this.d.transport.budget(viewId, 'raise');
      this.update(viewId, (s) => ({
        limit: null,
        usage: s.usage ? { ...s.usage, maxListCostCents } : null,
      }));
    } catch (err) {
      this.fail(viewId, err);
    }
    this.refreshUsage();
  }

  /** Reopens the upgrade prompt for the View's current limit notice (free plan only). */
  showUpgrade(viewId: string) {
    const s = this.session(viewId);
    if (s && s.limit && s.limit.canUpgrade) this.d.showUpgrade(s.limit);
  }

  async stopBudget(viewId: string) {
    try {
      await this.d.transport.budget(viewId, 'stop');
    } catch (err) {
      this.fail(viewId, err);
    }
  }

  async install(viewId: string) {
    try {
      this.d.promoteDraft(viewId);
    } catch (err) {
      this.update(viewId, () => ({ error: { code: 'install', message: err.message } }));
      return;
    }
    this.close(viewId);
  }

  async discard(viewId: string) {
    this.d.discardDraft(viewId);
    this.close(viewId);
  }

  /**
   * Stops streaming and forgets local state. Pending asks resolve as declined so the agent
   * isn't left waiting on a tool the user can no longer answer.
   */
  close(viewId: string) {
    this.stopStream(viewId);
    const rt = this.runtimes.get(viewId);
    if (rt) {
      for (const ask of rt.asks) {
        ask.resolve({
          content: [{ type: 'text', text: 'The user closed the panel.' }],
          isError: true,
        });
      }
    }
    this.runtimes.delete(viewId);
    this.sessions.delete(viewId);
    if (this.active === viewId) this.active = null;
    this.trigger();
  }
}

/** True for a session the user hasn't sent anything in and the agent isn't working on. */
export function isUntouched(s: AgentSessionState) {
  return s.transcript.length === 0 && !s.working && !s.pendingRequest;
}

export const AgentSessionStore = new AgentSessionStoreImpl();

/** The actions the authoring panel and entry points call. All return promises, including
 * the ones the store implements synchronously, so callers can chain `.catch`. */
export const AgentActions = {
  refreshUsage: async () => {
    await AgentSessionStore.refreshUsage();
  },
  showUpgrade: async (viewId: string) => AgentSessionStore.showUpgrade(viewId),
  start: async (opts: { viewId: string; name: string; request: string; examples?: string[] }) =>
    AgentSessionStore.start(opts),
  resume: async (viewId: string, name: string) => AgentSessionStore.resume(viewId, name),
  setActive: async (viewId: string | null) => AgentSessionStore.setActive(viewId),
  preview: async (viewId: string, name: string, intro: 'try' | 'edit') =>
    AgentSessionStore.preview(viewId, name, intro),
  chat: async (viewId: string) => AgentSessionStore.chat(viewId),
  sendMessage: async (viewId: string, text: string) => AgentSessionStore.sendMessage(viewId, text),
  retry: async (viewId: string) => AgentSessionStore.retry(viewId),
  startFresh: async (viewId: string) => AgentSessionStore.startFresh(viewId),
  attachThreads: async (viewId: string, threadIds: string[]) =>
    AgentSessionStore.attachThreads(viewId, threadIds),
  removeAttachment: async (viewId: string, messageId: string) =>
    AgentSessionStore.removeAttachment(viewId, messageId),
  submitExamples: async (viewId: string) => AgentSessionStore.submitExamples(viewId),
  skipExamples: async (viewId: string) => AgentSessionStore.skipExamples(viewId),
  answerQuestion: async (viewId: string, answer: string) =>
    AgentSessionStore.answerQuestion(viewId, answer),
  approveScreenshot: async (viewId: string) => AgentSessionStore.approveScreenshot(viewId),
  refreshScreenshot: async (viewId: string) => AgentSessionStore.refreshScreenshot(viewId),
  declineScreenshot: async (viewId: string) => AgentSessionStore.declineScreenshot(viewId),
  interrupt: async (viewId: string) => AgentSessionStore.interrupt(viewId),
  raiseBudget: async (viewId: string) => AgentSessionStore.raiseBudget(viewId),
  stopBudget: async (viewId: string) => AgentSessionStore.stopBudget(viewId),
  install: async (viewId: string) => AgentSessionStore.install(viewId),
  discard: async (viewId: string) => AgentSessionStore.discard(viewId),
  close: async (viewId: string) => AgentSessionStore.close(viewId),
};
