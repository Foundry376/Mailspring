import React from 'react';
import { credentialsFromManifest } from '../../../../src/browser/view-credential-policy';
import classnames from 'classnames';
import { DragDropTypes } from 'mailspring-exports';
import { panelSource, onPanelSourceChanged } from './store';
import { Markdown } from './markdown';
import {
  AgentSessionState,
  ExampleChip,
  RevisionEntry,
  SessionActionsLike,
  TranscriptEntry,
} from './types';
import { installedViews } from '../view-registry';
import { openViewsHome } from '../home/view-actions';
import { editButtonRect, focusedPageViewId } from './launch';

const GEOMETRY_KEY = 'views-authoring-panel-geometry';
const EDGE = 12;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 220;
const COLLAPSED_HEIGHT = 40;
const COLLAPSED_WIDTH = 380;
// Match the ap-pop-out and ap-morph-out animations in authoring-panel.less.
const EXIT_MS = 170;
const MORPH_OUT_MS = 200;
// A turn that started longer ago than this is a resumed session, not a turn worth timing.
const MAX_TURN_AGE_MS = 30 * 60 * 1000;
// While the agent asks for a screenshot, the thumbnail is recaptured this often so it shows
// the View as it finishes loading. "Live" is shown while captures keep arriving.
const SCREENSHOT_REFRESH_MS = 1000;
const LIVE_WINDOW_MS = 3000;
// The composer and answer fields start one line tall (matching the Send button) and grow with
// their content up to this height.
const TEXTAREA_MAX_HEIGHT = 96;

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight + 2, TEXTAREA_MAX_HEIGHT)}px`;
}

type PanelAnim = 'enter' | 'exit' | 'morph-in' | 'morph-out' | 'expand' | 'collapse' | null;

// Where the View's Edit button sits relative to the panel's bottom-right corner, so the panel
// can grow out of it and shrink back into it, and the scale that makes the panel button-sized.
interface Morph {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

interface Geometry {
  right: number;
  bottom: number;
  width: number;
  height: number;
  collapsed: boolean;
}

function defaultGeometry(): Geometry {
  return {
    right: 16,
    bottom: 16,
    width: Math.min(560, Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.4))),
    height: Math.max(MIN_HEIGHT + 120, Math.round(window.innerHeight * 0.4)),
    collapsed: false,
  };
}

function loadGeometry(): Geometry {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GEOMETRY_KEY) || 'null');
    if (saved && typeof saved.width === 'number') return { ...defaultGeometry(), ...saved };
  } catch {
    // Fall through to the default placement.
  }
  return defaultGeometry();
}

// Keeps the panel fully on screen when the window shrinks or a saved position is stale.
function clampGeometry(g: Geometry): Geometry {
  const maxW = Math.max(MIN_WIDTH, window.innerWidth - EDGE * 2);
  const maxH = Math.max(MIN_HEIGHT, window.innerHeight - EDGE * 2 - 40);
  const width = Math.min(Math.max(g.width, MIN_WIDTH), maxW);
  const height = Math.min(Math.max(g.height, MIN_HEIGHT), maxH);
  const shownHeight = g.collapsed ? COLLAPSED_HEIGHT : height;
  const right = Math.min(Math.max(g.right, EDGE), window.innerWidth - width - EDGE);
  const bottom = Math.min(Math.max(g.bottom, EDGE), window.innerHeight - shownHeight - EDGE);
  return { ...g, width, height, right: Math.max(EDGE, right), bottom: Math.max(EDGE, bottom) };
}

function hasThreadDrag(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types || []).includes(DragDropTypes.ThreadsDragType);
}

function formatBytes(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

function latestRevision(session: AgentSessionState): RevisionEntry | null {
  return session.revisions.length ? session.revisions[session.revisions.length - 1] : null;
}

function isBusy(session: AgentSessionState | null) {
  if (!session || session.pendingRequest) return false;
  return session.status === 'connecting' || session.status === 'running' || session.working;
}

// When the agent's current turn began: the user's latest message, so a panel reopened mid-turn
// still shows the real elapsed time.
function turnStartedAt(session: AgentSessionState) {
  for (let i = session.transcript.length - 1; i >= 0; i--) {
    const entry = session.transcript[i];
    if (entry.role === 'user') {
      return entry.ts && Date.now() - entry.ts < MAX_TURN_AGE_MS ? entry.ts : Date.now();
    }
  }
  return Date.now();
}

// Long agent turns cycle through these so a multi-minute build doesn't look stalled. They're
// flavor, not progress: concrete phases (previewing, fixing) always take precedence.
const BUSY_LINES = [
  'Thinking about layout…',
  'Testing your view…',
  'Checking how the data parses…',
  'Polishing the details…',
  'Choosing colors that match your theme…',
  'Wiring up the chart…',
  'Writing the queries…',
];
const EXAMPLES_LINE = 'Reading the examples you shared…';
const BUSY_LINE_MS = 7000;

function shuffledLineOrder(session: AgentSessionState) {
  const lastUser = [...session.transcript].reverse().find((e) => e.role === 'user');
  const lines = [...BUSY_LINES];
  if (lastUser && lastUser.attachments && lastUser.attachments.length) lines.push(EXAMPLES_LINE);
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  return lines;
}

// The turn opens on a plain description of what's happening, then rotates through `lines`.
// Distinct lines in a fixed cycle never repeat back to back, including across the wrap.
function busyLabel(session: AgentSessionState, elapsedMs: number, lines: string[]) {
  if (session.status === 'connecting') return 'Connecting…';
  const rev = latestRevision(session);
  if (rev && rev.status === 'previewing') return `Previewing revision ${rev.revision}…`;
  if (rev && rev.status !== 'ok') return 'Fixing errors…';
  const anchor = rev ? 'Updating the view…' : 'Building your view…';
  const slot = Math.floor(elapsedMs / BUSY_LINE_MS);
  if (slot === 0 || !lines.length) return anchor;
  return lines[(slot - 1) % lines.length];
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// The window corner the panel sits nearest, so it pops out of (and back into) that corner.
function anchorCorner(g: Geometry) {
  const height = g.collapsed ? COLLAPSED_HEIGHT : g.height;
  const centerX = window.innerWidth - g.right - g.width / 2;
  const centerY = window.innerHeight - g.bottom - height / 2;
  const left = centerX < window.innerWidth / 2;
  const top = centerY < window.innerHeight / 2;
  return {
    '--ap-origin': `${left ? 'left' : 'right'} ${top ? 'top' : 'bottom'}`,
    '--ap-dx': left ? '-14px' : '14px',
    '--ap-dy': top ? '-14px' : '14px',
  };
}

// The panel morphs to and from the Edit button only while the button's View is on screen.
function morphFor(viewId: string, g: Geometry): Morph | null {
  if (focusedPageViewId() !== viewId) return null;
  const rect = editButtonRect(viewId);
  if (!rect || g.collapsed) return null;
  // Measured from the panel's bottom-right corner, which stays put whatever its height (the
  // preview card makes the panel shorter than its saved geometry).
  return {
    x: window.innerWidth - g.right - (rect.left + rect.width / 2),
    y: window.innerHeight - g.bottom - (rect.top + rect.height / 2),
    sx: rect.width / g.width,
    sy: rect.height / g.height,
  };
}

function isUntouched(session: AgentSessionState) {
  return session.transcript.length === 0 && !session.working && !session.pendingRequest;
}

// The starter preview card shows until the user chats or installs.
function showsTryCard(session: AgentSessionState) {
  return session.intro === 'try' && isUntouched(session);
}

// An intro holds one card or one prompt, so the panel hugs it until the conversation starts.
function isCompactIntro(session: AgentSessionState) {
  return !!session.intro && isUntouched(session) && !session.error;
}

// Header status when the agent isn't busy; busy phases come from busyLabel.
function statusLine(session: AgentSessionState): { text: string; tone: string } {
  if (showsTryCard(session)) return { text: 'Preview', tone: 'attention' };
  if (isCompactIntro(session)) return { text: 'Ask for a change', tone: 'muted' };
  const rev = latestRevision(session);
  switch (session.status) {
    case 'budget_reached':
      return { text: 'Spend limit reached', tone: 'warning' };
    case 'terminated':
      return { text: 'Session ended', tone: 'muted' };
    case 'error':
      return { text: 'Error', tone: 'error' };
    default:
      break;
  }
  if (session.pendingRequest) return { text: 'Waiting for you', tone: 'attention' };
  if (rev && rev.status === 'ok') return { text: `Ready — revision ${rev.revision}`, tone: 'ok' };
  if (rev && rev.status === 'rejected') return { text: 'Revision rejected', tone: 'error' };
  return { text: 'Idle', tone: 'muted' };
}

function Chip({ chip, onRemove }: { chip: ExampleChip; onRemove?: () => void }) {
  return (
    <div className="ap-chip" title={`${chip.from} — ${chip.subject}`}>
      <div className="ap-chip-text">
        <span className="ap-chip-from">{chip.from}</span>
        <span className="ap-chip-subject">{chip.subject || '(No Subject)'}</span>
      </div>
      <span className="ap-chip-meta">
        {formatDate(chip.date)}
        {chip.bytes ? ` · ${formatBytes(chip.bytes)}` : ''}
      </span>
      {onRemove && (
        <button className="ap-chip-remove" onClick={onRemove} aria-label="Remove example">
          ×
        </button>
      )}
    </div>
  );
}

interface State {
  // The session being rendered. It outlives the store's active session by EXIT_MS so the
  // close animation can play.
  session: AgentSessionState | null;
  leaving: boolean;
  anim: PanelAnim;
  // Alternates so re-triggering the same animation restarts it (a changed animation-name does).
  animFlip: number;
  geometry: Geometry;
  draft: string;
  answer: string;
  dragDepth: number;
  confirmingInstall: boolean;
  busySince: number | null;
  busyLines: string[];
  now: number;
  morph: Morph | null;
}

/**
 * The floating "AI" surface for building a View with the hosted agent. It is the only place
 * anything is shared with the agent: dropped threads become example chips, and screenshots
 * are sent only after the user approves the thumbnail. Visibility follows the agent store's
 * active session, so it persists while the user navigates sheets.
 */
export class AuthoringPanel extends React.Component<Record<string, unknown>, State> {
  static displayName = 'ViewsAuthoringPanel';

  _unlisten: () => void = null;
  _unlistenSource: () => void = null;
  _transcriptEl: HTMLDivElement = null;
  _pointer: { mode: 'move' | 'resize'; x: number; y: number; start: Geometry } = null;
  _exitTimer: ReturnType<typeof setTimeout> = null;
  _ticker: ReturnType<typeof setInterval> = null;
  _screenshotTimer: ReturnType<typeof setInterval> = null;
  _composerEl: HTMLTextAreaElement = null;
  _answerEl: HTMLTextAreaElement = null;

  state: State = {
    session: null,
    leaving: false,
    anim: null,
    animFlip: 0,
    geometry: clampGeometry(loadGeometry()),
    draft: '',
    answer: '',
    dragDepth: 0,
    confirmingInstall: false,
    busySince: null,
    busyLines: [],
    now: Date.now(),
    morph: null,
  };

  componentDidMount() {
    this._subscribe();
    this._unlistenSource = onPanelSourceChanged(this._subscribe);
    window.addEventListener('resize', this._onWindowResize);
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
    if (this._unlistenSource) this._unlistenSource();
    window.removeEventListener('resize', this._onWindowResize);
    this._endPointer();
    clearTimeout(this._exitTimer);
    clearInterval(this._ticker);
    clearInterval(this._screenshotTimer);
  }

  // Polls for a fresh capture only while a screenshot request is open and the panel is
  // expanded; the store keeps the last image if the View goes off screen.
  _syncScreenshotRefresh() {
    const { session, geometry, leaving } = this.state;
    const wants =
      !!session &&
      !leaving &&
      !geometry.collapsed &&
      !!session.pendingRequest &&
      session.pendingRequest.kind === 'screenshot';
    if (wants && !this._screenshotTimer) {
      this._screenshotTimer = setInterval(() => {
        const actions = this._actions();
        const current = this.state.session;
        // Ages the "Live" badge if captures stop arriving (the View went off screen).
        this.setState({ now: Date.now() });
        if (actions && actions.refreshScreenshot && current) {
          actions.refreshScreenshot(current.viewId).catch(() => {});
        }
      }, SCREENSHOT_REFRESH_MS);
    } else if (!wants && this._screenshotTimer) {
      clearInterval(this._screenshotTimer);
      this._screenshotTimer = null;
    }
  }

  componentDidUpdate(prevProps, prevState: State) {
    const prev = prevState.session;
    const next = this.state.session;
    this._syncScreenshotRefresh();
    if (prevState.draft && !this.state.draft) autoGrow(this._composerEl);
    if (prevState.answer && !this.state.answer) autoGrow(this._answerEl);

    // The elapsed timer ticks only while the agent is working.
    if (this.state.busySince && !this._ticker) {
      this._ticker = setInterval(() => this.setState({ now: Date.now() }), 1000);
    } else if (!this.state.busySince && this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }

    const grew =
      next &&
      (!prev ||
        prev.viewId !== next.viewId ||
        prev.transcript.length !== next.transcript.length ||
        prev.attachedExamples.length !== next.attachedExamples.length ||
        (prev.pendingRequest && prev.pendingRequest.toolUseId) !==
          (next.pendingRequest && next.pendingRequest.toolUseId) ||
        isBusy(prev) !== isBusy(next) ||
        prevState.geometry.collapsed !== this.state.geometry.collapsed);
    if (
      (grew || (this.state.confirmingInstall && !prevState.confirmingInstall)) &&
      this._transcriptEl
    ) {
      this._transcriptEl.scrollTop = this._transcriptEl.scrollHeight;
    }
  }

  _scrollToEnd = () => {
    if (this._transcriptEl) this._transcriptEl.scrollTop = this._transcriptEl.scrollHeight;
  };

  // The live thumbnail reloads every second; only follow it if the user hasn't scrolled up.
  _onScreenshotLoad = () => {
    const el = this._transcriptEl;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) this._scrollToEnd();
  };

  // Re-subscribes when the store is swapped (the dev demo replaces the real store).
  _subscribe = () => {
    if (this._unlisten) this._unlisten();
    const source = panelSource();
    if (!source) {
      this._unlisten = null;
      this.setState({ session: null });
      return;
    }
    this._unlisten = source.store.listen(this._onStoreChange);
    this._onStoreChange();
  };

  _onStoreChange = () => {
    const source = panelSource();
    const session = source ? source.store.activeSession() : null;

    if (!session) {
      // Keep rendering the last session while the close animation plays.
      if (!this.state.session || this.state.leaving) return;
      const morph = morphFor(this.state.session.viewId, this.state.geometry);
      this.setState({ leaving: true, anim: morph ? 'morph-out' : 'exit', morph, busySince: null });
      clearTimeout(this._exitTimer);
      this._exitTimer = setTimeout(
        () => {
          this.setState({ session: null, leaving: false, anim: null, confirmingInstall: false });
        },
        morph ? MORPH_OUT_MS : EXIT_MS
      );
      return;
    }

    clearTimeout(this._exitTimer);
    this.setState((s) => {
      const sameView = s.session && !s.leaving && s.session.viewId === session.viewId;
      const wasBusy = sameView && isBusy(s.session);
      const busy = isBusy(session);
      const morph = sameView ? s.morph : morphFor(session.viewId, s.geometry);
      return {
        session,
        leaving: false,
        morph,
        anim: sameView ? s.anim : morph ? 'morph-in' : 'enter',
        confirmingInstall: sameView ? s.confirmingInstall : false,
        answer: sameView && session.pendingRequest ? s.answer : '',
        busySince: !busy ? null : wasBusy && s.busySince ? s.busySince : turnStartedAt(session),
        busyLines: busy && wasBusy ? s.busyLines : busy ? shuffledLineOrder(session) : [],
        now: Date.now(),
      };
    });
  };

  _actions(): SessionActionsLike | null {
    const source = panelSource();
    return source ? source.actions : null;
  }

  _run(fn: (actions: SessionActionsLike, viewId: string) => Promise<void>) {
    const actions = this._actions();
    const session = this.state.session;
    if (!actions || !session) return;
    Promise.resolve(fn(actions, session.viewId)).catch((err) => {
      console.warn(`Views authoring panel: ${err.message}`);
    });
  }

  _setGeometry(next: Geometry, persist = true) {
    const geometry = clampGeometry(next);
    this.setState({ geometry });
    if (persist) {
      try {
        window.localStorage.setItem(GEOMETRY_KEY, JSON.stringify(geometry));
      } catch {
        // Position just won't be remembered.
      }
    }
  }

  _onWindowResize = () => {
    this._setGeometry(this.state.geometry, false);
  };

  _onHeaderMouseDown = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button')) return;
    this._beginPointer('move', event);
  };

  _onResizeMouseDown = (event: React.MouseEvent) => {
    this._beginPointer('resize', event);
  };

  _beginPointer(mode: 'move' | 'resize', event: React.MouseEvent) {
    event.preventDefault();
    this._pointer = { mode, x: event.clientX, y: event.clientY, start: this.state.geometry };
    window.addEventListener('mousemove', this._onPointerMove);
    window.addEventListener('mouseup', this._onPointerUp);
  }

  _onPointerMove = (event: MouseEvent) => {
    if (!this._pointer) return;
    const { mode, x, y, start } = this._pointer;
    const dx = event.clientX - x;
    const dy = event.clientY - y;
    if (mode === 'move') {
      this._setGeometry({ ...start, right: start.right - dx, bottom: start.bottom - dy }, false);
    } else {
      // The handle is the top-left corner; the panel stays anchored bottom-right.
      this._setGeometry({ ...start, width: start.width - dx, height: start.height - dy }, false);
    }
  };

  _onPointerUp = () => {
    this._endPointer();
    this._setGeometry(this.state.geometry, true);
  };

  _endPointer() {
    this._pointer = null;
    window.removeEventListener('mousemove', this._onPointerMove);
    window.removeEventListener('mouseup', this._onPointerUp);
  }

  _onDragEnter = (event: React.DragEvent) => {
    if (!hasThreadDrag(event)) return;
    event.preventDefault();
    this.setState((s) => ({ dragDepth: s.dragDepth + 1 }));
  };

  _onDragOver = (event: React.DragEvent) => {
    if (!hasThreadDrag(event)) return;
    event.preventDefault();
    // The thread list only allows 'move'; any other dropEffect would refuse the drop.
    event.dataTransfer.dropEffect = 'move';
  };

  _onDragLeave = (event: React.DragEvent) => {
    if (!hasThreadDrag(event)) return;
    this.setState((s) => ({ dragDepth: Math.max(0, s.dragDepth - 1) }));
  };

  _onDrop = (event: React.DragEvent) => {
    this.setState({ dragDepth: 0 });
    if (!hasThreadDrag(event)) return;
    event.preventDefault();
    let threadIds: string[] = [];
    try {
      const data = JSON.parse(event.dataTransfer.getData(DragDropTypes.ThreadsDragType));
      threadIds = Array.isArray(data.threadIds) ? data.threadIds : [];
    } catch {
      return;
    }
    if (!threadIds.length) return;
    if (this.state.geometry.collapsed) {
      this._setGeometry({ ...this.state.geometry, collapsed: false });
    }
    this._run((a, viewId) => a.attachThreads(viewId, threadIds));
  };

  _onComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this._onSend();
    }
  };

  _onSend = () => {
    const { session, draft } = this.state;
    if (!session || session.pendingRequest) return;
    const text = draft.trim();
    if (!text && !session.attachedExamples.length) return;
    this.setState({ draft: '' });
    this._run((a, viewId) => a.sendMessage(viewId, text));
  };

  _onAnswer = () => {
    const text = this.state.answer.trim();
    if (!text) return;
    this.setState({ answer: '' });
    this._run((a, viewId) => a.answerQuestion(viewId, text));
  };

  _onAnswerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this._onAnswer();
    }
  };

  _toggleCollapsed = () => {
    const g = this.state.geometry;
    // Over its own View the panel minimizes back into the Edit button rather than to a pill.
    if (!g.collapsed && this.state.session && morphFor(this.state.session.viewId, g)) {
      this._close();
      return;
    }
    this.setState((s) => ({
      anim: g.collapsed ? 'expand' : 'collapse',
      animFlip: s.animFlip + 1,
    }));
    this._setGeometry({ ...g, collapsed: !g.collapsed });
  };

  _close = () => {
    const actions = this._actions();
    if (actions) actions.setActive(null);
  };

  _renderHeader(session: AgentSessionState) {
    // While busy, the header names the phase; the rotating flavor lines stay on the busy card.
    const status = isBusy(session)
      ? { text: busyLabel(session, 0, []), tone: 'working' }
      : statusLine(session);
    const working = session.working || session.status === 'running';
    return (
      <div className="ap-header" onMouseDown={this._onHeaderMouseDown}>
        <span className={classnames('ap-dot', `tone-${status.tone}`, { pulsing: working })} />
        <div className="ap-title">
          <span className="ap-name">{session.name || 'New View'}</span>
          <span className={classnames('ap-status', `tone-${status.tone}`)}>{status.text}</span>
        </div>
        {session.usage && !this.state.geometry.collapsed && (
          <span className="ap-usage" title="Agent spend for this View">
            ${(session.usage.listCostCents / 100).toFixed(2)} / $
            {(session.usage.maxListCostCents / 100).toFixed(2)}
          </span>
        )}
        {/* Expanded, Stop lives on the busy card in the transcript. */}
        {working && this.state.geometry.collapsed && (
          <button
            className="ap-btn ap-btn-ghost"
            onClick={() => this._run((a, v) => a.interrupt(v))}
          >
            Stop
          </button>
        )}
        <button
          className="ap-icon-btn"
          onClick={this._toggleCollapsed}
          aria-label={this.state.geometry.collapsed ? 'Expand' : 'Minimize'}
        >
          {this.state.geometry.collapsed ? '▴' : '▾'}
        </button>
        <button className="ap-icon-btn" onClick={this._close} aria-label="Close">
          ×
        </button>
      </div>
    );
  }

  _renderTranscript(session: AgentSessionState) {
    return (
      <div className="ap-transcript" ref={(el) => (this._transcriptEl = el)}>
        {showsTryCard(session) && this._renderTryCard(session)}
        {session.transcript.length === 0 && !showsTryCard(session) && (
          <div className="ap-empty">
            {session.intro === 'edit'
              ? 'What would you like to change? Describe it, and drag in example emails if it helps.'
              : 'Describe the View you want, then drag a few example emails onto this panel.'}
          </div>
        )}
        {session.transcript.map((entry) => this._renderEntry(session, entry))}
        {this._pendingWithoutEntry(session) && this._renderPending(session, true)}
        {this._renderBusy(session)}
        {this._renderBanners(session)}
      </div>
    );
  }

  _renderEntry(session: AgentSessionState, entry: TranscriptEntry) {
    if (entry.kind === 'revision' && entry.revision) {
      return this._renderRevisionCard(entry.id, entry.revision);
    }
    if (entry.kind === 'request') {
      // An open request renders its controls in place; answered ones stay as the agent's ask.
      const open = session.pendingRequest && session.pendingRequest.toolUseId === entry.toolUseId;
      if (open) {
        return (
          <div key={entry.id} className="ap-entry role-agent">
            {this._renderPending(session, true)}
          </div>
        );
      }
      return (
        <div key={entry.id} className="ap-entry role-agent ap-asked">
          <Markdown text={entry.text} />
        </div>
      );
    }
    return (
      <div
        key={entry.id}
        className={classnames('ap-entry', `role-${entry.role}`, {
          'ap-response': entry.kind === 'response',
        })}
      >
        {entry.role === 'agent' ? (
          <Markdown text={entry.text} />
        ) : (
          <div className="ap-entry-text">{entry.text}</div>
        )}
        {entry.thumbnail && (
          <img className="ap-sent-screenshot" src={entry.thumbnail} alt="Screenshot you sent" />
        )}
        {entry.attachments && entry.attachments.length > 0 && (
          <div className="ap-sent-chips">
            {entry.attachments.map((chip) => (
              <Chip key={chip.messageId} chip={chip} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Stores that predate request entries (and the dev demo) only have `pendingRequest`.
  _pendingWithoutEntry(session: AgentSessionState) {
    const pending = session.pendingRequest;
    if (!pending) return false;
    return !session.transcript.some(
      (t) => t.kind === 'request' && t.toolUseId === pending.toolUseId
    );
  }

  // A starter being tried: nothing has been sent to the agent, and nothing will be until the
  // user chats and sends a message.
  _renderTryCard(session: AgentSessionState) {
    return (
      <div className="ap-try">
        <div className="ap-try-text">
          You're previewing the <strong>{session.name}</strong> view. Install it, or chat to
          customize it.
        </div>
        {this.state.confirmingInstall ? (
          this._renderConsent(session)
        ) : (
          <div className="ap-try-footer">
            <button className="ap-link" onClick={this._onRemovePreview}>
              Remove preview
            </button>
            <span className="ap-ready-spacer" />
            <button
              className="ap-btn"
              onClick={() => this._run((a, v) => (a.chat ? a.chat(v) : Promise.resolve()))}
            >
              Chat
            </button>
            <button
              className="ap-btn ap-btn-primary"
              onClick={() => this.setState({ confirmingInstall: true })}
            >
              Install
            </button>
          </div>
        )}
      </div>
    );
  }

  _onRemovePreview = () => {
    const session = this.state.session;
    if (!session) return;
    // The draft is the View, so the page it was showing goes away with it.
    if (focusedPageViewId() === session.viewId) openViewsHome();
    this._run((a, v) => a.discard(v));
  };

  _renderRevisionCard(key: string, rev: RevisionEntry) {
    return (
      <div key={key} className={classnames('ap-revision', `rev-${rev.status}`)}>
        <div className="ap-revision-line">
          <span className="ap-revision-label">Revision {rev.revision}</span>
          {rev.status !== 'unknown' && <span className="ap-revision-status">{rev.status}</span>}
          {rev.summary && <span className="ap-revision-summary">{rev.summary}</span>}
        </div>
      </div>
    );
  }

  // The agent's first build can take minutes, so working state gets a live card in the chat
  // rather than only the header dot.
  _renderBusy(session: AgentSessionState) {
    if (!isBusy(session)) return null;
    const elapsed = this.state.busySince ? this.state.now - this.state.busySince : 0;
    const firstBuild = session.revisions.length === 0 && session.status !== 'connecting';
    const label = busyLabel(session, elapsed, this.state.busyLines);
    return (
      <div className="ap-busy" role="status" aria-live="polite">
        <div className="ap-busy-line">
          <span className="ap-busy-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {/* Keyed by text so each new line crossfades in. */}
          <span className="ap-busy-label" key={label}>
            {label}
          </span>
          {this.state.busySince && <span className="ap-busy-time">{formatElapsed(elapsed)}</span>}
          {session.status !== 'connecting' && (
            <button
              className="ap-btn ap-btn-ghost ap-busy-stop"
              onClick={() => this._run((a, v) => a.interrupt(v))}
            >
              Stop
            </button>
          )}
        </div>
        <div className="ap-busy-bar" aria-hidden="true">
          <span />
        </div>
        {firstBuild && (
          <div className="ap-busy-hint">
            The first version usually takes a few minutes. You can keep using Mailspring.
          </div>
        )}
      </div>
    );
  }

  _renderPending(session: AgentSessionState, withPrompt: boolean) {
    const pending = session.pendingRequest;
    if (!pending) return null;
    if (pending.kind === 'examples') {
      // The Send / Skip actions sit with the staged chips in the footer, next to exactly what
      // will be sent.
      return (
        <div className="ap-request">
          {withPrompt && <Markdown text={pending.prompt} />}
          <div className="ap-request-hint">
            Drag emails from your mailbox onto this panel. Only the emails you drop here are shared.
          </div>
        </div>
      );
    }
    if (pending.kind === 'screenshot') {
      return (
        <div className="ap-request">
          {withPrompt && (
            <Markdown text={pending.prompt || 'I took a screenshot of the preview. Send it?'} />
          )}
          {pending.screenshot && (
            <div className="ap-screenshot-wrap">
              <img
                className="ap-screenshot"
                src={pending.screenshot.dataUrl}
                alt="Screenshot of the View preview"
                onLoad={this._onScreenshotLoad}
              />
              {pending.screenshot.capturedAt &&
                this.state.now - pending.screenshot.capturedAt < LIVE_WINDOW_MS && (
                  <span className="ap-live" title="Updates as the View changes">
                    Live
                  </span>
                )}
            </div>
          )}
          {pending.screenshot && pending.screenshot.note && (
            <div className="ap-screenshot-note">{pending.screenshot.note}</div>
          )}
          <div className="ap-request-hint">
            Sends the View as it looks when you click. It can show any mail the preview displays.
          </div>
          <div className="ap-actions ap-actions-end">
            <button
              className="ap-btn ap-btn-ghost"
              onClick={() => this._run((a, v) => a.declineScreenshot(v))}
            >
              Don't send
            </button>
            <button
              className="ap-btn ap-btn-primary"
              onClick={() => this._run((a, v) => a.approveScreenshot(v))}
            >
              Send screenshot
            </button>
          </div>
        </div>
      );
    }
    const hasChoices = pending.choices && pending.choices.length > 0;
    return (
      <div className="ap-request">
        {withPrompt && <Markdown text={pending.prompt} />}
        {hasChoices ? (
          <div className="ap-actions">
            {pending.choices.map((choice) => (
              <button
                key={choice}
                className="ap-btn"
                onClick={() => this._run((a, v) => a.answerQuestion(v, choice))}
              >
                {choice}
              </button>
            ))}
          </div>
        ) : (
          <div className="ap-answer">
            <textarea
              rows={1}
              ref={(el) => (this._answerEl = el)}
              value={this.state.answer}
              placeholder="Type your answer…"
              onChange={(e) => {
                autoGrow(e.target);
                this.setState({ answer: e.target.value });
              }}
              onKeyDown={this._onAnswerKeyDown}
            />
            <button
              className="ap-btn ap-btn-primary"
              disabled={!this.state.answer.trim()}
              onClick={this._onAnswer}
            >
              Answer
            </button>
          </div>
        )}
      </div>
    );
  }

  // Install and Discard live in the footer, shown only once the agent is done and the latest
  // revision rendered; the revision cards in the chat are history.
  _renderReadyBar(session: AgentSessionState) {
    const rev = latestRevision(session);
    if (!rev || (rev.status !== 'ok' && rev.status !== 'unknown')) return null;
    if (isBusy(session) || session.pendingRequest) return null;
    if (session.status === 'terminated' || session.status === 'budget_reached') return null;
    if (this.state.confirmingInstall) {
      return <div className="ap-ready">{this._renderConsent(session)}</div>;
    }
    return (
      <div className="ap-ready">
        <span className="ap-ready-label">
          Revision {rev.revision} {rev.status === 'ok' ? 'ready' : ''}
        </span>
        <span className="ap-ready-spacer" />
        <button
          className="ap-btn ap-btn-primary"
          onClick={() => this.setState({ confirmingInstall: true })}
        >
          Install View
        </button>
        <button className="ap-btn ap-btn-ghost" onClick={() => this._run((a, v) => a.discard(v))}>
          Discard
        </button>
      </div>
    );
  }

  _renderConsent(session: AgentSessionState) {
    const manifest = installedViews().find((v) => v.id === session.viewId);
    const permissions = manifest ? manifest.permissions : [];
    const network: string[] = (manifest && manifest.json && manifest.json.network) || [];
    const readsBodies = permissions.includes('mail.bodies');
    return (
      <div className="ap-consent">
        <div className="ap-consent-title">Install “{session.name}”?</div>
        <ul>
          {permissions.length === 0 && <li>No special permissions.</li>}
          {permissions.map((p) => (
            <li key={p}>
              <code>{p}</code>
            </li>
          ))}
          {network.length > 0 && (
            <li>
              Can connect to <strong>{network.join(', ')}</strong>
              {readsBodies ? ' — and can send your email content there.' : '.'}
            </li>
          )}
          {credentialsFromManifest(manifest && manifest.json).map((c) => (
            <li key={`credential-${c.id}`}>
              Can ask for your <strong>{c.label}</strong> and use it for requests to{' '}
              <strong>{c.hosts.join(', ')}</strong>. It never sees the key.
            </li>
          ))}
        </ul>
        <div className="ap-actions ap-actions-end">
          <button
            className="ap-btn ap-btn-ghost"
            onClick={() => this.setState({ confirmingInstall: false })}
          >
            Cancel
          </button>
          <button
            className="ap-btn ap-btn-primary"
            onClick={() => {
              this.setState({ confirmingInstall: false });
              this._run((a, v) => a.install(v));
            }}
          >
            Install
          </button>
        </div>
      </div>
    );
  }

  _renderBanners(session: AgentSessionState) {
    if (session.status === 'budget_reached') {
      const u = session.usage;
      return (
        <div className="ap-banner tone-warning">
          <div>
            This View reached its spend limit
            {u
              ? ` ($${(u.listCostCents / 100).toFixed(2)} of $${(u.maxListCostCents / 100).toFixed(2)})`
              : ''}
            .
          </div>
          <div className="ap-actions">
            <button
              className="ap-btn ap-btn-primary"
              onClick={() => this._run((a, v) => a.raiseBudget(v))}
            >
              Continue (+$2)
            </button>
            <button
              className="ap-btn ap-btn-ghost"
              onClick={() => this._run((a, v) => a.stopBudget(v))}
            >
              Stop here
            </button>
          </div>
        </div>
      );
    }
    if (session.error) {
      return <div className="ap-banner tone-error">{session.error.message}</div>;
    }
    return null;
  }

  _renderStaged(session: AgentSessionState) {
    const chips = session.attachedExamples;
    const wantsExamples = session.pendingRequest && session.pendingRequest.kind === 'examples';
    if (!chips.length && !wantsExamples) return null;
    return (
      <div className="ap-staged">
        <div className="ap-staged-label">
          {chips.length
            ? `Will be shared with the agent (${chips.length})`
            : 'Nothing attached yet'}
        </div>
        {chips.length > 0 ? (
          <div className="ap-chips">
            {chips.map((chip) => (
              <Chip
                key={chip.messageId}
                chip={chip}
                onRemove={() => this._run((a, v) => a.removeAttachment(v, chip.messageId))}
              />
            ))}
          </div>
        ) : (
          <div className="ap-drop-hint">Drop emails here</div>
        )}
        {wantsExamples && (
          <div className="ap-actions ap-actions-end">
            <button
              className="ap-btn ap-btn-ghost"
              onClick={() => this._run((a, v) => a.skipExamples(v))}
            >
              Skip
            </button>
            <button
              className="ap-btn ap-btn-primary"
              disabled={!chips.length}
              onClick={() => this._run((a, v) => a.submitExamples(v))}
            >
              {chips.length
                ? `Send ${chips.length} example${chips.length === 1 ? '' : 's'}`
                : 'Send examples'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // While the agent is asking for something, the request's own controls are the only actions,
  // so the free-text composer steps aside and the transcript gets the room.
  _renderComposer(session: AgentSessionState) {
    // The preview card carries its own actions until the user chooses Chat.
    if (showsTryCard(session)) return null;
    const pending = session.pendingRequest;
    if (pending) {
      return pending.kind === 'examples' ? (
        <div className="ap-footer">{this._renderStaged(session)}</div>
      ) : null;
    }
    const placeholder =
      session.transcript.length || session.intro
        ? 'Tell the agent what to change…'
        : 'Describe the View you want…';
    const disabled = session.status === 'terminated' || session.status === 'budget_reached';
    return (
      <div className="ap-footer">
        {this._renderReadyBar(session)}
        {this._renderStaged(session)}
        <div className="ap-composer">
          <textarea
            rows={1}
            ref={(el) => (this._composerEl = el)}
            value={this.state.draft}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => {
              autoGrow(e.target);
              this.setState({ draft: e.target.value });
            }}
            onKeyDown={this._onComposerKeyDown}
          />
          <button
            className="ap-btn ap-btn-primary"
            disabled={disabled || (!this.state.draft.trim() && !session.attachedExamples.length)}
            onClick={this._onSend}
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  render() {
    const { session, geometry, dragDepth, anim, animFlip, leaving } = this.state;
    if (!session) return null;

    // The preview card is short, so the panel hugs it instead of opening at chat height.
    const compact = !geometry.collapsed && isCompactIntro(session);
    const style = {
      right: geometry.right,
      bottom: geometry.bottom,
      width: geometry.collapsed ? Math.min(COLLAPSED_WIDTH, geometry.width) : geometry.width,
      height: geometry.collapsed ? COLLAPSED_HEIGHT : compact ? undefined : geometry.height,
      maxHeight: compact ? geometry.height : undefined,
      ...anchorCorner(geometry),
    } as React.CSSProperties;

    const animClass =
      anim === 'expand' || anim === 'collapse'
        ? `anim-${anim}-${animFlip % 2}`
        : anim && `anim-${anim}`;
    const { morph } = this.state;
    if (morph && (anim === 'morph-in' || anim === 'morph-out')) {
      Object.assign(style, {
        '--ap-morph-origin': `calc(100% - ${morph.x}px) calc(100% - ${morph.y}px)`,
        '--ap-msx': morph.sx,
        '--ap-msy': morph.sy,
      });
    }

    return (
      <div
        className={classnames('views-authoring-panel', animClass, {
          collapsed: geometry.collapsed,
          compact,
          leaving,
          'drop-target': dragDepth > 0,
          'has-request': !!session.pendingRequest,
        })}
        style={style}
        onDragEnter={this._onDragEnter}
        onDragOver={this._onDragOver}
        onDragLeave={this._onDragLeave}
        onDrop={this._onDrop}
        role="complementary"
        aria-label="View authoring assistant"
      >
        {!geometry.collapsed && !compact && (
          <div className="ap-resize" onMouseDown={this._onResizeMouseDown} title="Resize" />
        )}
        {this._renderHeader(session)}
        {!geometry.collapsed && this._renderTranscript(session)}
        {!geometry.collapsed && this._renderComposer(session)}
        {dragDepth > 0 && (
          <div className="ap-drop-overlay">
            <div>Drop to attach as examples</div>
            <div className="ap-drop-sub">You'll see exactly what is shared before it's sent.</div>
          </div>
        )}
      </div>
    );
  }
}
