import React from 'react';
import classnames from 'classnames';
import { DragDropTypes } from 'mailspring-exports';
import { panelSource, onPanelSourceChanged } from './store';
import { Markdown } from './markdown';
import { AgentSessionState, ExampleChip, RevisionEntry, SessionActionsLike } from './types';
import { installedViews } from '../view-registry';

const GEOMETRY_KEY = 'views-authoring-panel-geometry';
const EDGE = 12;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 220;
const COLLAPSED_HEIGHT = 40;
const COLLAPSED_WIDTH = 380;
// Matches the ap-pop-out animation in authoring-panel.less.
const EXIT_MS = 170;
// A turn that started longer ago than this is a resumed session, not a turn worth timing.
const MAX_TURN_AGE_MS = 30 * 60 * 1000;

type PanelAnim = 'enter' | 'exit' | 'expand' | 'collapse' | null;

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

// Header status when the agent isn't busy; busy phases come from busyLabel.
function statusLine(session: AgentSessionState): { text: string; tone: string } {
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
  }

  componentDidUpdate(prevProps, prevState: State) {
    const prev = prevState.session;
    const next = this.state.session;

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
      this.setState({ leaving: true, anim: 'exit', busySince: null });
      clearTimeout(this._exitTimer);
      this._exitTimer = setTimeout(() => {
        this.setState({ session: null, leaving: false, anim: null, confirmingInstall: false });
      }, EXIT_MS);
      return;
    }

    clearTimeout(this._exitTimer);
    this.setState((s) => {
      const sameView = s.session && !s.leaving && s.session.viewId === session.viewId;
      const wasBusy = sameView && isBusy(s.session);
      const busy = isBusy(session);
      return {
        session,
        leaving: false,
        anim: sameView ? s.anim : 'enter',
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
          aria-label={this.state.geometry.collapsed ? 'Expand' : 'Collapse'}
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
        {session.transcript.length === 0 && (
          <div className="ap-empty">
            Describe the View you want, then drag a few example emails onto this panel.
          </div>
        )}
        {session.transcript.map((entry) => (
          <div key={entry.id} className={classnames('ap-entry', `role-${entry.role}`)}>
            {entry.role === 'agent' ? (
              <Markdown text={entry.text} />
            ) : (
              <div className="ap-entry-text">{entry.text}</div>
            )}
            {entry.attachments && entry.attachments.length > 0 && (
              <div className="ap-sent-chips">
                {entry.attachments.map((chip) => (
                  <Chip key={chip.messageId} chip={chip} />
                ))}
              </div>
            )}
          </div>
        ))}
        {this._renderRevision(session)}
        {this._renderPending(session)}
        {this._renderBusy(session)}
        {this._renderBanners(session)}
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

  _renderPending(session: AgentSessionState) {
    const pending = session.pendingRequest;
    if (!pending) return null;
    if (pending.kind === 'examples') {
      // The Send / Skip actions sit with the staged chips in the footer, next to exactly what
      // will be sent.
      return (
        <div className="ap-request">
          <Markdown text={pending.prompt} />
          <div className="ap-request-hint">
            Drag emails from your mailbox onto this panel. Only the emails you drop here are shared.
          </div>
        </div>
      );
    }
    if (pending.kind === 'screenshot') {
      return (
        <div className="ap-request">
          <Markdown text={pending.prompt || 'I took a screenshot of the preview. Send it?'} />
          {pending.screenshot && (
            <img
              className="ap-screenshot"
              src={pending.screenshot.dataUrl}
              alt="Screenshot of the View preview"
              onLoad={this._scrollToEnd}
            />
          )}
          <div className="ap-request-hint">
            The screenshot can show any mail the preview displays.
          </div>
          <div className="ap-actions">
            <button
              className="ap-btn ap-btn-primary"
              onClick={() => this._run((a, v) => a.approveScreenshot(v))}
            >
              Send screenshot
            </button>
            <button
              className="ap-btn ap-btn-ghost"
              onClick={() => this._run((a, v) => a.declineScreenshot(v))}
            >
              Don't send
            </button>
          </div>
        </div>
      );
    }
    const hasChoices = pending.choices && pending.choices.length > 0;
    return (
      <div className="ap-request">
        <Markdown text={pending.prompt} />
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
              rows={2}
              value={this.state.answer}
              placeholder="Type your answer…"
              onChange={(e) => this.setState({ answer: e.target.value })}
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

  _renderRevision(session: AgentSessionState) {
    const rev = latestRevision(session);
    if (!rev) return null;
    const working = session.working || session.status === 'running';
    const ready = rev.status === 'ok' && !working && !session.pendingRequest;
    return (
      <div className={classnames('ap-revision', `rev-${rev.status}`)}>
        <div className="ap-revision-line">
          <span className="ap-revision-label">Revision {rev.revision}</span>
          <span className="ap-revision-status">{rev.status}</span>
          {rev.summary && <span className="ap-revision-summary">{rev.summary}</span>}
        </div>
        {ready && !this.state.confirmingInstall && (
          <div className="ap-actions">
            <button
              className="ap-btn ap-btn-primary"
              onClick={() => this.setState({ confirmingInstall: true })}
            >
              Install View
            </button>
            <button
              className="ap-btn ap-btn-ghost"
              onClick={() => this._run((a, v) => a.discard(v))}
            >
              Discard
            </button>
          </div>
        )}
        {ready && this.state.confirmingInstall && this._renderConsent(session)}
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
        </ul>
        <div className="ap-actions">
          <button
            className="ap-btn ap-btn-primary"
            onClick={() => {
              this.setState({ confirmingInstall: false });
              this._run((a, v) => a.install(v));
            }}
          >
            Install
          </button>
          <button
            className="ap-btn ap-btn-ghost"
            onClick={() => this.setState({ confirmingInstall: false })}
          >
            Cancel
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
          <div className="ap-actions">
            <button
              className="ap-btn ap-btn-primary"
              disabled={!chips.length}
              onClick={() => this._run((a, v) => a.submitExamples(v))}
            >
              {chips.length
                ? `Send ${chips.length} example${chips.length === 1 ? '' : 's'}`
                : 'Send examples'}
            </button>
            <button
              className="ap-btn ap-btn-ghost"
              onClick={() => this._run((a, v) => a.skipExamples(v))}
            >
              Skip
            </button>
          </div>
        )}
      </div>
    );
  }

  // While the agent is asking for something, the request's own controls are the only actions,
  // so the free-text composer steps aside and the transcript gets the room.
  _renderComposer(session: AgentSessionState) {
    const pending = session.pendingRequest;
    if (pending) {
      return pending.kind === 'examples' ? (
        <div className="ap-footer">{this._renderStaged(session)}</div>
      ) : null;
    }
    const placeholder = session.transcript.length
      ? 'Tell the agent what to change…'
      : 'Describe the View you want…';
    const disabled = session.status === 'terminated' || session.status === 'budget_reached';
    return (
      <div className="ap-footer">
        {this._renderStaged(session)}
        <div className="ap-composer">
          <textarea
            rows={2}
            value={this.state.draft}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => this.setState({ draft: e.target.value })}
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

    const style = {
      right: geometry.right,
      bottom: geometry.bottom,
      width: geometry.collapsed ? Math.min(COLLAPSED_WIDTH, geometry.width) : geometry.width,
      height: geometry.collapsed ? COLLAPSED_HEIGHT : geometry.height,
      ...anchorCorner(geometry),
    } as React.CSSProperties;

    const animClass =
      anim === 'expand' || anim === 'collapse'
        ? `anim-${anim}-${animFlip % 2}`
        : anim && `anim-${anim}`;

    return (
      <div
        className={classnames('views-authoring-panel', animClass, {
          collapsed: geometry.collapsed,
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
        {!geometry.collapsed && (
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
