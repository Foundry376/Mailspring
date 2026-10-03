import fs from 'fs';
import path from 'path';
import MailspringStore from 'mailspring-store';
import { FeatureUsageStore, IdentityStore, localized } from 'mailspring-exports';
import { ViewAuthoring, openView } from '../authoring';
import { installedViews } from '../view-registry';
import { AgentClient, AgentTransport } from './client';
import { chipFor, examplesForThreads } from './examples';
import { runClientTool, ToolDeps, ToolResult } from './tools';
import {
  AgentAPIError,
  AgentEvent,
  AgentSessionState,
  Example,
  PendingRequest,
  RevisionEntry,
  ToolContent,
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

const UPGRADE_LEXICON = {
  headerText: '',
  rechargeText: localized(
    `You can build %1$@ Views a %2$@ with the AI assistant. Upgrade to Pro to build more.`
  ),
  iconUrl: 'mailspring://composer-grammar-check/assets/ic-modal-image@2x.png',
};

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
  promoteDraft: (viewId: string) => void;
  discardDraft: (viewId: string) => void;
  showUpgrade: (feature: string) => void;
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
      try {
        return await ViewAuthoring.captureViewPreview(viewId, { maxWidth: SCREENSHOT_MAX_WIDTH });
      } catch (err) {
        // A View opened just now may not have painted yet.
        await new Promise((resolve) => setTimeout(resolve, 800));
        return ViewAuthoring.captureViewPreview(viewId, { maxWidth: SCREENSHOT_MAX_WIDTH });
      }
    },
    promoteDraft: (viewId) => ViewAuthoring.promoteDraft(viewId),
    discardDraft: (viewId) => ViewAuthoring.discardDraft(viewId),
    showUpgrade: (feature) => {
      FeatureUsageStore.displayUpgradeModal(feature, UPGRADE_LEXICON).catch(() => {});
    },
  };
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
}

let localIds = 0;
const localId = (prefix: string) => `local-${prefix}-${Date.now()}-${(localIds += 1)}`;

class AgentSessionStoreImpl extends MailspringStore {
  private sessions = new Map<string, AgentSessionState>();
  private runtimes = new Map<string, SessionRuntime>();
  private active: string | null = null;
  private deps: AgentStoreDeps = null;

  /** Replaces the store's collaborators; used by specs. Clears all sessions. */
  configure(deps: Partial<AgentStoreDeps>) {
    for (const viewId of [...this.runtimes.keys()]) this.stopStream(viewId);
    this.sessions.clear();
    this.runtimes.clear();
    this.active = null;
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

  private fail(viewId: string, err: any) {
    const code = err instanceof AgentAPIError ? err.code : 'unknown';
    if (code === 'quota')
      this.d.showUpgrade((err.details && err.details.feature) || 'view-agent-build');
    this.update(viewId, () => ({
      status: 'error',
      working: false,
      error: { code, message: err.message || String(err) },
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
        if (event.resolved || rt.handledToolUseIds.has(event.toolUseId)) return;
        rt.handledToolUseIds.add(event.toolUseId);
        this.runTool(viewId, event);
        return;
      default:
        return;
    }
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
      recordRevision: (entry) => this.recordRevision(viewId, entry),
      ask: (request) =>
        new Promise<ToolResult>((resolve) => {
          const rt = this.runtime(viewId);
          rt.asks.push({ request: { toolUseId, ...request }, resolve });
          this.syncPendingRequest(viewId);
        }),
    };
  }

  private recordRevision(viewId: string, entry: RevisionEntry) {
    this.update(viewId, (s) => {
      const revisions = s.revisions.filter((r) => r.revision !== entry.revision);
      return { revisions: [...revisions, entry].sort((a, b) => a.revision - b.revision) };
    });
  }

  private syncPendingRequest(viewId: string) {
    const rt = this.runtime(viewId);
    this.update(viewId, () => ({ pendingRequest: rt.asks.length ? rt.asks[0].request : null }));
  }

  private async runTool(viewId: string, event: Extract<AgentEvent, { type: 'tool_request' }>) {
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

  private answer(viewId: string, kind: PendingRequest['kind'], result: ToolResult) {
    const rt = this.runtime(viewId);
    const ask = rt.asks[0];
    if (!ask || ask.request.kind !== kind) return false;
    rt.asks.shift();
    this.syncPendingRequest(viewId);
    ask.resolve(result);
    return true;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async start({
    viewId,
    name,
    request,
    examples = [],
  }: {
    viewId: string;
    name: string;
    request: string;
    examples?: string[];
  }) {
    this.ensure(viewId, name);
    this.setActive(viewId);
    const rt = this.runtime(viewId);
    this.update(viewId, (s) => ({
      status: 'connecting',
      working: true,
      error: null,
      transcript: [
        ...s.transcript,
        { id: localId('user'), role: 'user', text: request, ts: Date.now() },
      ],
    }));
    try {
      const built = examples.length ? await this.d.buildExamples(examples) : [];
      const all = [...rt.staged.values(), ...built];
      rt.staged.clear();
      this.update(viewId, (s) => {
        const transcript = [...s.transcript];
        const last = transcript[transcript.length - 1];
        if (last && all.length)
          transcript[transcript.length - 1] = { ...last, attachments: all.map(chipFor) };
        return { transcript, attachedExamples: [] };
      });
      const current = this.d.currentBundle(viewId);
      await this.d.transport.createSession({
        viewId,
        name,
        request,
        examples: all,
        ...(current ? { current } : {}),
      });
      await this.openStream(viewId);
    } catch (err) {
      this.fail(viewId, err);
    }
  }

  /**
   * Reattaches to the View's existing session without sending anything. Rejects with an
   * AgentAPIError whose code is `no_session` when the View has never had one.
   */
  async resume(viewId: string, name: string) {
    this.ensure(viewId, name);
    this.setActive(viewId);
    await this.openStream(viewId);
  }

  setActive(viewId: string | null) {
    this.active = viewId;
    this.trigger();
  }

  async sendMessage(viewId: string, text: string) {
    const rt = this.runtime(viewId);
    const examples = [...rt.staged.values()];
    const trimmed = (text || '').trim();
    if (!trimmed && !examples.length) return;
    rt.staged.clear();
    this.update(viewId, (s) => ({
      working: true,
      attachedExamples: [],
      transcript: [
        ...s.transcript,
        {
          id: localId('user'),
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
      this.fail(viewId, err);
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
    const ok = this.answer(viewId, 'examples', {
      content: [{ type: 'text', text: JSON.stringify({ examples }) }],
    });
    if (!ok) return;
    rt.staged.clear();
    this.update(viewId, (s) => ({
      attachedExamples: [],
      transcript: [
        ...s.transcript,
        {
          id: localId('examples'),
          role: 'user',
          text: localized('Shared %@ examples', examples.length),
          attachments: examples.map(chipFor),
          ts: Date.now(),
        },
      ],
    }));
  }

  skipExamples(viewId: string) {
    this.answer(viewId, 'examples', {
      content: [{ type: 'text', text: JSON.stringify({ skipped: true }) }],
    });
  }

  answerQuestion(viewId: string, answer: string) {
    if (this.answer(viewId, 'question', { content: [{ type: 'text', text: answer }] })) {
      this.update(viewId, (s) => ({
        transcript: [
          ...s.transcript,
          { id: localId('answer'), role: 'user', text: answer, ts: Date.now() },
        ],
      }));
    }
  }

  approveScreenshot(viewId: string) {
    const s = this.session(viewId);
    const shot = s && s.pendingRequest && s.pendingRequest.screenshot;
    if (!shot) return;
    const content: ToolContent[] = [
      {
        type: 'image',
        mediaType: 'image/png',
        dataBase64: shot.dataUrl.replace(/^data:image\/png;base64,/, ''),
      },
    ];
    if (this.answer(viewId, 'screenshot', { content })) {
      this.update(viewId, (st) => ({
        transcript: [
          ...st.transcript,
          {
            id: localId('screenshot'),
            role: 'system',
            text: localized('Sent a screenshot of the preview.'),
            ts: Date.now(),
          },
        ],
      }));
    }
  }

  declineScreenshot(viewId: string) {
    this.answer(viewId, 'screenshot', { content: [{ type: 'text', text: 'declined' }] });
  }

  async interrupt(viewId: string) {
    try {
      await this.d.transport.interrupt(viewId);
    } catch (err) {
      this.fail(viewId, err);
    }
  }

  async raiseBudget(viewId: string) {
    try {
      const { maxListCostCents } = await this.d.transport.budget(viewId, 'raise');
      this.update(viewId, (s) => ({
        usage: s.usage ? { ...s.usage, maxListCostCents } : null,
      }));
    } catch (err) {
      this.fail(viewId, err);
    }
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

export const AgentSessionStore = new AgentSessionStoreImpl();

/** The actions the authoring panel and entry points call. */
export const AgentActions = {
  start: (opts: { viewId: string; name: string; request: string; examples?: string[] }) =>
    AgentSessionStore.start(opts),
  resume: (viewId: string, name: string) => AgentSessionStore.resume(viewId, name),
  setActive: (viewId: string | null) => AgentSessionStore.setActive(viewId),
  sendMessage: (viewId: string, text: string) => AgentSessionStore.sendMessage(viewId, text),
  attachThreads: (viewId: string, threadIds: string[]) =>
    AgentSessionStore.attachThreads(viewId, threadIds),
  removeAttachment: (viewId: string, messageId: string) =>
    AgentSessionStore.removeAttachment(viewId, messageId),
  submitExamples: (viewId: string) => AgentSessionStore.submitExamples(viewId),
  skipExamples: (viewId: string) => AgentSessionStore.skipExamples(viewId),
  answerQuestion: (viewId: string, answer: string) =>
    AgentSessionStore.answerQuestion(viewId, answer),
  approveScreenshot: (viewId: string) => AgentSessionStore.approveScreenshot(viewId),
  declineScreenshot: (viewId: string) => AgentSessionStore.declineScreenshot(viewId),
  interrupt: (viewId: string) => AgentSessionStore.interrupt(viewId),
  raiseBudget: (viewId: string) => AgentSessionStore.raiseBudget(viewId),
  stopBudget: (viewId: string) => AgentSessionStore.stopBudget(viewId),
  install: (viewId: string) => AgentSessionStore.install(viewId),
  discard: (viewId: string) => AgentSessionStore.discard(viewId),
  close: (viewId: string) => AgentSessionStore.close(viewId),
};
