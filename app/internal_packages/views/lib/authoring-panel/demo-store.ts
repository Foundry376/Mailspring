import { DatabaseStore, Thread } from 'mailspring-exports';
import {
  AgentSessionState,
  ExampleChip,
  RevisionEntry,
  SessionActionsLike,
  SessionStoreLike,
  TranscriptEntry,
} from './types';
import { setPanelSourceOverride } from './store';
import { AccountUsage, limitNotice } from '../agent/quota';

// A scripted stand-in for `lib/agent`, for seeing every panel state in dev without a backend:
// `$m.ViewsAuthoringPanelDemo('building' | 'examples' | 'working' | 'fixing' | 'screenshot' |
// 'question' | 'answer' | 'ready' | 'history' | 'budget' | 'error' | 'budget-partial' |
// 'budget-exhausted' | 'limit-free-build' | 'limit-free-spend' | 'limit-pro-build' |
// 'limit-pro-spend' | 'rate-limited' | 'turn-limit' | 'too-long')`, and
// `$m.ViewsAuthoringPanelDemo(null)` to restore the real store. Entries mirror what lib/agent
// records: requests, responses and revisions are transcript entries in chronological order.

export type DemoScenario =
  | 'building'
  | 'examples'
  | 'working'
  | 'fixing'
  | 'screenshot'
  | 'question'
  | 'answer'
  | 'ready'
  | 'history'
  | 'budget'
  | 'error'
  | 'budget-partial'
  | 'budget-exhausted'
  | 'limit-free-build'
  | 'limit-free-spend'
  | 'limit-pro-build'
  | 'limit-pro-spend'
  | 'rate-limited'
  | 'turn-limit'
  | 'too-long';

const VIEW_ID = 'demo-receipts';

const NEXT_MONTH = '2026-11-01T00:00:00.000Z';
const freeUsage = (used: number, usedCents: number): AccountUsage => ({
  plan: 'free',
  period: 'unlimited',
  builds: { used, limit: 2 },
  spend: { usedCents, limitCents: 500 },
  resetsAt: null,
});
const proUsage = (used: number, usedCents: number): AccountUsage => ({
  plan: 'pro',
  period: '2026-10',
  builds: { used, limit: 10 },
  spend: { usedCents, limitCents: 800 },
  resetsAt: NEXT_MONTH,
});

/** The account allowance each scenario shows in the header meter. */
function usageFor(name: DemoScenario): AccountUsage {
  switch (name) {
    case 'budget-partial':
      return freeUsage(1, 420);
    case 'budget-exhausted':
    case 'limit-free-spend':
      return freeUsage(1, 503);
    case 'limit-free-build':
      return freeUsage(2, 311);
    case 'limit-pro-build':
      return proUsage(10, 412);
    case 'limit-pro-spend':
      return proUsage(6, 806);
    default:
      return freeUsage(1, 38);
  }
}

// A small striped placeholder standing in for a captured preview.
const PLACEHOLDER_SHOT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#f4f5f7"/><rect x="24" y="24" width="300" height="28" rx="4" fill="#d5d9e0"/><rect x="24" y="76" width="592" height="180" rx="8" fill="#e6e9ee"/><g fill="#7a8ca8">${[
      40, 90, 60, 120, 80, 140, 100,
    ]
      .map((h, i) => `<rect x="${60 + i * 78}" y="${240 - h}" width="44" height="${h}" rx="3"/>`)
      .join(
        ''
      )}</g><rect x="24" y="280" width="592" height="18" rx="4" fill="#dde1e7"/><rect x="24" y="308" width="420" height="18" rx="4" fill="#dde1e7"/></svg>`
  );

const request = (
  toolUseId: string,
  kind: TranscriptEntry['requestKind'],
  text: string
): TranscriptEntry => ({
  id: `req-${toolUseId}`,
  kind: 'request',
  role: 'agent',
  text,
  toolUseId,
  requestKind: kind,
});

const response = (toolUseId: string, entry: Partial<TranscriptEntry>): TranscriptEntry => ({
  id: `resp-${toolUseId}`,
  kind: 'response',
  role: 'user',
  text: '',
  toolUseId,
  ...entry,
});

// Records a revision the way lib/agent does: in `revisions` and as a transcript entry.
function addRevision(s: AgentSessionState, revision: RevisionEntry) {
  s.revisions = [...s.revisions.filter((r) => r.revision !== revision.revision), revision];
  const entry: TranscriptEntry = {
    id: `rev-${revision.revision}`,
    kind: 'revision',
    role: 'system',
    text: revision.summary || '',
    revision,
  };
  const idx = s.transcript.findIndex((t) => t.id === entry.id);
  if (idx === -1) s.transcript.push(entry);
  else s.transcript[idx] = entry;
}

// Opens a request the way lib/agent does: a transcript entry plus the pending request.
function ask(s: AgentSessionState, pending: AgentSessionState['pendingRequest']) {
  s.transcript.push(request(pending.toolUseId, pending.kind, pending.prompt));
  s.pendingRequest = pending;
}

function baseSession(): AgentSessionState {
  return {
    viewId: VIEW_ID,
    name: 'Receipts',
    status: 'idle',
    working: false,
    transcript: [
      {
        id: 'u1',
        role: 'user',
        text: 'Show my Uber and Lyft receipts charted by month, with a table of recent trips.',
      },
      {
        id: 'a1',
        role: 'agent',
        text: "I'll build a **monthly spend chart** and a table of recent rides. To get the parsing right I need a couple of real receipts:\n\n- one Uber trip receipt\n- one Lyft ride receipt",
      },
    ],
    pendingRequest: null,
    attachedExamples: [],
    revisions: [],
    usage: { listCostCents: 38, maxListCostCents: 200 },
    error: null,
  };
}

function scenario(name: DemoScenario): AgentSessionState {
  const s = baseSession();
  const sentChips: ExampleChip[] = [
    {
      messageId: 'm1',
      threadId: 't1',
      subject: 'Your Thursday evening trip with Uber',
      from: 'Uber Receipts',
      date: '2026-09-18T02:14:00.000Z',
      bytes: 18400,
    },
    {
      messageId: 'm2',
      threadId: 't2',
      subject: 'Your ride with Dana on September 12',
      from: 'Lyft',
      date: '2026-09-12T17:40:00.000Z',
      bytes: 22100,
    },
  ];
  const afterExamples = () => {
    s.transcript.push({
      id: 'u2',
      role: 'user',
      text: 'Here are two receipts.',
      attachments: sentChips,
      ts: Date.now() - 42000,
    });
    s.transcript.push({
      id: 'a2',
      role: 'agent',
      text: 'Thanks — the Uber total sits next to `Total` and Lyft uses `Charged`. Building the first revision now.',
    });
  };

  switch (name) {
    case 'building':
      // The first build, 75 seconds in: the request plus examples, no revision yet.
      s.transcript = [
        {
          id: 'u1',
          role: 'user',
          text: 'Show my Uber and Lyft receipts charted by month, with a table of recent trips.',
          attachments: sentChips,
          ts: Date.now() - 75000,
        },
      ];
      s.status = 'running';
      s.working = true;
      s.usage = { listCostCents: 9, maxListCostCents: 200 };
      break;
    case 'examples':
      ask(s, {
        toolUseId: 'tu1',
        kind: 'examples',
        prompt: 'Drag one **Uber** receipt and one **Lyft** receipt here.',
      });
      break;
    case 'working':
      afterExamples();
      s.status = 'running';
      s.working = true;
      addRevision(s, { revision: 1, status: 'previewing', summary: 'Previewing…' });
      break;
    case 'fixing':
      afterExamples();
      s.status = 'running';
      s.working = true;
      addRevision(s, { revision: 1, status: 'failed', summary: 'TypeError at View.jsx:42' });
      break;
    case 'screenshot':
      afterExamples();
      addRevision(s, { revision: 2, status: 'ok', summary: 'Rendered without errors' });
      ask(s, {
        toolUseId: 'tu2',
        kind: 'screenshot',
        prompt: 'I took a screenshot of the preview to check the layout. Send it?',
        screenshot: { dataUrl: PLACEHOLDER_SHOT, width: 640, height: 360, capturedAt: Date.now() },
      });
      break;
    case 'question':
      afterExamples();
      addRevision(s, { revision: 2, status: 'ok', summary: 'Rendered without errors' });
      ask(s, {
        toolUseId: 'tu3',
        kind: 'question',
        prompt: 'Should tips be included in the monthly totals?',
        choices: ['Include tips', 'Exclude tips'],
      });
      break;
    case 'answer':
      afterExamples();
      addRevision(s, { revision: 2, status: 'ok', summary: 'Rendered without errors' });
      ask(s, {
        toolUseId: 'tu4',
        kind: 'question',
        prompt: 'Which card do you use for rides? I can filter receipts to it.',
      });
      break;
    case 'ready':
      afterExamples();
      addRevision(s, { revision: 3, status: 'ok', summary: 'Rendered without errors' });
      s.transcript.push({
        id: 'a3',
        role: 'agent',
        text: 'Revision 3 is ready: the chart now excludes tips and the table links to each trip.',
      });
      break;
    case 'history':
      // A finished conversation: answered requests stay in place, revisions where they happened.
      s.transcript = [
        {
          id: 'u1',
          role: 'user',
          text: 'Show my Uber and Lyft receipts charted by month, with a table of recent trips.',
        },
        request('tu1', 'examples', 'Drag one **Uber** receipt and one **Lyft** receipt here.'),
        response('tu1', { text: 'Shared 2 examples', attachments: sentChips }),
      ];
      addRevision(s, { revision: 1, status: 'ok', summary: 'Rendered without errors' });
      s.transcript.push({ id: 'a2', role: 'agent', text: 'Here is a first version.' });
      s.transcript.push({ id: 'u2', role: 'user', text: 'Stack the bars by service, please.' });
      s.transcript.push(
        request('tu2', 'screenshot', 'I took a screenshot of the preview to check the legend.')
      );
      s.transcript.push(
        response('tu2', { text: 'Sent a screenshot', thumbnail: PLACEHOLDER_SHOT })
      );
      addRevision(s, { revision: 2, status: 'ok', summary: 'Rendered without errors' });
      s.transcript.push(request('tu3', 'question', 'Should tips be included in the totals?'));
      s.transcript.push(response('tu3', { text: 'Exclude tips' }));
      addRevision(s, { revision: 3, status: 'ok', summary: 'Rendered without errors' });
      s.transcript.push({
        id: 'a3',
        role: 'agent',
        text: 'Done: bars are stacked by service and tips are excluded.',
      });
      break;
    case 'budget':
      afterExamples();
      s.status = 'budget_reached';
      s.usage = { listCostCents: 203, maxListCostCents: 200 };
      addRevision(s, { revision: 4, status: 'ok', summary: 'Rendered without errors' });
      break;
    case 'budget-partial':
    case 'budget-exhausted':
      afterExamples();
      s.status = 'budget_reached';
      s.usage = { listCostCents: 203, maxListCostCents: 200 };
      addRevision(s, { revision: 2, status: 'ok', summary: 'Rendered without errors' });
      break;
    case 'limit-free-build':
      s.transcript = s.transcript.slice(0, 1);
      s.limit = limitNotice('quota', {
        feature: 'view-agent-build',
        plan: 'free',
        limit: 2,
        used: 2,
        period: 'unlimited',
        resetsAt: null,
      });
      break;
    case 'limit-free-spend':
      afterExamples();
      s.limit = limitNotice('spend_quota', {
        feature: 'view-agent-spend',
        plan: 'free',
        limitCents: 500,
        usedCents: 503,
        period: 'unlimited',
        resetsAt: null,
      });
      break;
    case 'limit-pro-build':
      s.transcript = s.transcript.slice(0, 1);
      s.limit = limitNotice('quota', {
        feature: 'view-agent-build',
        plan: 'pro',
        limit: 10,
        used: 10,
        period: 'monthly',
        resetsAt: NEXT_MONTH,
      });
      break;
    case 'limit-pro-spend':
      afterExamples();
      s.limit = limitNotice('spend_quota', {
        feature: 'view-agent-spend',
        plan: 'pro',
        limitCents: 800,
        usedCents: 806,
        period: 'monthly',
        resetsAt: NEXT_MONTH,
      });
      break;
    case 'rate-limited':
      afterExamples();
      s.notice = {
        code: 'rate_limited',
        action: 'retry',
        message: 'Too many requests. Please try again later.',
      };
      break;
    case 'turn-limit':
      afterExamples();
      s.notice = {
        code: 'session_turn_limit',
        action: 'start_fresh',
        message:
          "This View's chat has reached its 40-message limit. Start a fresh chat to keep improving it.",
      };
      s.returnedDraft = {
        text: 'Also show the merchant logo next to each receipt.',
        seq: Date.now(),
      };
      break;
    case 'too-long':
      afterExamples();
      s.messageLimit = 4000;
      s.returnedDraft = {
        text: `Here are the details for the chart: ${'receipts and totals by month, '.repeat(175)}`,
        seq: Date.now(),
      };
      break;
    case 'error':
      afterExamples();
      s.status = 'error';
      s.error = { code: 'network', message: 'Lost connection to the Mailspring server. Retrying…' };
      break;
  }
  return s;
}

class DemoStore implements SessionStoreLike {
  current: AgentSessionState | null = null;
  active: string | null = null;
  usage: AccountUsage | null = null;

  accountUsage() {
    return this.usage;
  }
  listeners = new Set<() => void>();

  session(viewId: string) {
    return this.current && this.current.viewId === viewId ? this.current : null;
  }
  activeViewId() {
    return this.active;
  }
  activeSession() {
    return this.active ? this.session(this.active) : null;
  }
  listen(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  update(fn: (s: AgentSessionState) => void) {
    if (this.current) {
      this.current = { ...this.current };
      fn(this.current);
    }
    this.listeners.forEach((cb) => cb());
  }
}

const demoStore = new DemoStore();
let seq = 100;

function log(text: string) {
  demoStore.update((s) => {
    s.transcript = [...s.transcript, { id: `sys${seq++}`, role: 'system', text }];
  });
}

// Answers the open request: the user's response follows the agent's ask in the transcript.
function respond(fn: (s: AgentSessionState) => Partial<TranscriptEntry>) {
  demoStore.update((s) => {
    if (!s.pendingRequest) return;
    s.transcript = [...s.transcript, response(s.pendingRequest.toolUseId, fn(s))];
    s.pendingRequest = null;
  });
}

const demoActions: SessionActionsLike = {
  async setActive(viewId) {
    demoStore.active = viewId;
    demoStore.update(() => {});
  },
  async retry() {
    demoStore.update((s) => {
      s.notice = null;
    });
  },
  async startFresh() {
    demoStore.update((s) => {
      s.notice = null;
    });
    log("Your next message starts a fresh chat with this View's current code.");
  },
  async sendMessage(viewId, text) {
    demoStore.update((s) => {
      s.transcript = [
        ...s.transcript,
        { id: `u${seq++}`, role: 'user', text, attachments: s.attachedExamples, ts: Date.now() },
      ];
      s.attachedExamples = [];
      s.status = 'running';
      s.working = true;
    });
  },
  async attachThreads(viewId, threadIds) {
    const threads = await DatabaseStore.findAll<Thread>(Thread).where(
      Thread.attributes.id.in(threadIds)
    );
    demoStore.update((s) => {
      const existing = new Set(s.attachedExamples.map((c) => c.threadId));
      const chips = threads
        .filter((t) => !existing.has(t.id))
        .map((t) => {
          const from = (t.participants || []).find((p) => !p.isMe()) || (t.participants || [])[0];
          return {
            messageId: `${t.id}-latest`,
            threadId: t.id,
            subject: t.subject,
            from: from ? from.displayName() : '',
            date: new Date(t.lastMessageReceivedTimestamp).toISOString(),
            bytes: (t.snippet || '').length * 40,
          };
        });
      s.attachedExamples = [...s.attachedExamples, ...chips];
    });
  },
  async removeAttachment(viewId, messageId) {
    demoStore.update((s) => {
      s.attachedExamples = s.attachedExamples.filter((c) => c.messageId !== messageId);
    });
  },
  async submitExamples() {
    respond((s) => ({
      text: `Shared ${s.attachedExamples.length} example${s.attachedExamples.length === 1 ? '' : 's'}`,
      attachments: s.attachedExamples,
    }));
    demoStore.update((s) => (s.attachedExamples = []));
  },
  async skipExamples() {
    respond(() => ({ text: 'Skipped' }));
  },
  async answerQuestion(viewId, answer) {
    respond(() => ({ text: answer }));
  },
  async approveScreenshot() {
    respond((s) => ({
      text: 'Sent a screenshot',
      thumbnail: s.pendingRequest.screenshot && s.pendingRequest.screenshot.dataUrl,
    }));
  },
  async declineScreenshot() {
    respond(() => ({ text: "Didn't send the screenshot" }));
  },
  async refreshScreenshot() {
    demoStore.update((s) => {
      if (s.pendingRequest && s.pendingRequest.screenshot) {
        s.pendingRequest = {
          ...s.pendingRequest,
          screenshot: { ...s.pendingRequest.screenshot, capturedAt: Date.now() },
        };
      }
    });
  },
  async interrupt() {
    demoStore.update((s) => {
      s.working = false;
      s.status = 'idle';
    });
  },
  async raiseBudget() {
    demoStore.update((s) => {
      s.status = 'running';
      s.working = true;
      s.usage = { listCostCents: 203, maxListCostCents: 403 };
    });
  },
  async stopBudget() {
    log('Stopped at the spend limit.');
  },
  async refreshUsage() {
    demoStore.update(() => {});
  },
  async showUpgrade() {
    log('(The upgrade dialog would open here.)');
  },
  async install() {
    log('Installed.');
  },
  async discard() {
    log('Draft discarded.');
  },
};

/** Dev helper: shows the panel in a scripted state, or `null` to return to the real store. */
export function ViewsAuthoringPanelDemo(name: DemoScenario | null = 'examples') {
  if (name === null) {
    demoStore.active = null;
    setPanelSourceOverride(null);
    return 'Restored the real agent store.';
  }
  demoStore.current = scenario(name);
  demoStore.usage = usageFor(name);
  demoStore.active = VIEW_ID;
  setPanelSourceOverride({ store: demoStore, actions: demoActions });
  demoStore.update(() => {});
  return `Showing demo state "${name}".`;
}
