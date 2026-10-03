import { DatabaseStore, Thread } from 'mailspring-exports';
import { AgentSessionState, ExampleChip, SessionActionsLike, SessionStoreLike } from './types';
import { setPanelSourceOverride } from './store';

// A scripted stand-in for `lib/agent`, for seeing every panel state in dev without a backend:
// `$m.ViewsAuthoringPanelDemo('examples' | 'working' | 'fixing' | 'screenshot' | 'question' |
// 'ready' | 'budget' | 'error')`, and `$m.ViewsAuthoringPanelDemo(null)` to restore the real store.

export type DemoScenario =
  | 'examples'
  | 'working'
  | 'fixing'
  | 'screenshot'
  | 'question'
  | 'ready'
  | 'budget'
  | 'error';

const VIEW_ID = 'demo-receipts';

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
    });
    s.transcript.push({
      id: 'a2',
      role: 'agent',
      text: 'Thanks — the Uber total sits next to `Total` and Lyft uses `Charged`. Building the first revision now.',
    });
  };

  switch (name) {
    case 'examples':
      s.pendingRequest = {
        toolUseId: 'tu1',
        kind: 'examples',
        prompt: 'Drag one **Uber** receipt and one **Lyft** receipt here.',
      };
      break;
    case 'working':
      afterExamples();
      s.status = 'running';
      s.working = true;
      s.revisions = [{ revision: 1, status: 'previewing', summary: 'Chart + recent trips table' }];
      break;
    case 'fixing':
      afterExamples();
      s.status = 'running';
      s.working = true;
      s.revisions = [{ revision: 1, status: 'failed', summary: 'TypeError at View.jsx:42' }];
      break;
    case 'screenshot':
      afterExamples();
      s.revisions = [{ revision: 2, status: 'ok', summary: 'Rendered 37 receipts' }];
      s.pendingRequest = {
        toolUseId: 'tu2',
        kind: 'screenshot',
        prompt: 'I took a screenshot of the preview to check the layout. Send it?',
        screenshot: { dataUrl: PLACEHOLDER_SHOT, width: 640, height: 360 },
      };
      break;
    case 'question':
      afterExamples();
      s.revisions = [{ revision: 2, status: 'ok', summary: 'Rendered 37 receipts' }];
      s.pendingRequest = {
        toolUseId: 'tu3',
        kind: 'question',
        prompt: 'Should tips be included in the monthly totals?',
        choices: ['Include tips', 'Exclude tips'],
      };
      break;
    case 'ready':
      afterExamples();
      s.transcript.push({
        id: 'a3',
        role: 'agent',
        text: 'Revision 3 is ready: the chart now excludes tips and the table links to each trip.',
      });
      s.revisions = [{ revision: 3, status: 'ok', summary: 'Rendered 37 receipts, no errors' }];
      break;
    case 'budget':
      afterExamples();
      s.status = 'budget_reached';
      s.usage = { listCostCents: 203, maxListCostCents: 200 };
      s.revisions = [{ revision: 4, status: 'ok', summary: 'Rendered 37 receipts' }];
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

const demoActions: SessionActionsLike = {
  async setActive(viewId) {
    demoStore.active = viewId;
    demoStore.update(() => {});
  },
  async sendMessage(viewId, text) {
    demoStore.update((s) => {
      s.transcript = [
        ...s.transcript,
        { id: `u${seq++}`, role: 'user', text, attachments: s.attachedExamples },
      ];
      s.attachedExamples = [];
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
    demoStore.update((s) => {
      s.transcript = [
        ...s.transcript,
        { id: `u${seq++}`, role: 'user', text: 'Sent examples.', attachments: s.attachedExamples },
      ];
      s.attachedExamples = [];
      s.pendingRequest = null;
    });
  },
  async skipExamples() {
    demoStore.update((s) => (s.pendingRequest = null));
  },
  async answerQuestion(viewId, answer) {
    demoStore.update((s) => {
      s.transcript = [...s.transcript, { id: `u${seq++}`, role: 'user', text: answer }];
      s.pendingRequest = null;
    });
  },
  async approveScreenshot() {
    demoStore.update((s) => (s.pendingRequest = null));
    log('Screenshot sent.');
  },
  async declineScreenshot() {
    demoStore.update((s) => (s.pendingRequest = null));
    log('Screenshot not sent.');
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
  demoStore.active = VIEW_ID;
  setPanelSourceOverride({ store: demoStore, actions: demoActions });
  demoStore.update(() => {});
  return `Showing demo state "${name}".`;
}
