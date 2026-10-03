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

function statusLine(session: AgentSessionState): { text: string; tone: string } {
  const rev = latestRevision(session);
  switch (session.status) {
    case 'connecting':
      return { text: 'Connecting…', tone: 'working' };
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
  if (session.working || session.status === 'running') {
    if (rev && rev.status === 'previewing') {
      return { text: `Previewing revision ${rev.revision}…`, tone: 'working' };
    }
    if (rev && (rev.status === 'failed' || rev.status === 'timeout')) {
      return { text: 'Fixing errors automatically…', tone: 'working' };
    }
    return { text: rev ? `Building revision ${rev.revision + 1}…` : 'Thinking…', tone: 'working' };
  }
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
  session: AgentSessionState | null;
  geometry: Geometry;
  draft: string;
  dragDepth: number;
  confirmingInstall: boolean;
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

  state: State = {
    session: null,
    geometry: clampGeometry(loadGeometry()),
    draft: '',
    dragDepth: 0,
    confirmingInstall: false,
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
  }

  componentDidUpdate(prevProps, prevState: State) {
    const prev = prevState.session;
    const next = this.state.session;
    const grew =
      next &&
      (!prev ||
        prev.viewId !== next.viewId ||
        prev.transcript.length !== next.transcript.length ||
        prev.attachedExamples.length !== next.attachedExamples.length ||
        !!prev.pendingRequest !== !!next.pendingRequest);
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
    this.setState((s) => ({
      session,
      confirmingInstall:
        s.session && session && s.session.viewId === session.viewId ? s.confirmingInstall : false,
    }));
  };

  _actions(): SessionActionsLike | null {
    const source = panelSource();
    return source ? source.actions : null;
  }

  _run(fn: (actions: SessionActionsLike, viewId: string) => Promise<void>) {
    const actions = this._actions();
    const session = this.state.session;
    if (!actions || !session) return;
    fn(actions, session.viewId).catch((err) => {
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
    if (!session) return;
    const text = draft.trim();
    const pending = session.pendingRequest;
    if (pending && pending.kind === 'question') {
      if (!text) return;
      this.setState({ draft: '' });
      this._run((a, viewId) => a.answerQuestion(viewId, text));
      return;
    }
    if (!text && !session.attachedExamples.length) return;
    this.setState({ draft: '' });
    this._run((a, viewId) => a.sendMessage(viewId, text));
  };

  _toggleCollapsed = () => {
    const g = this.state.geometry;
    this._setGeometry({ ...g, collapsed: !g.collapsed });
  };

  _close = () => {
    const actions = this._actions();
    if (actions) actions.setActive(null);
  };

  _renderHeader(session: AgentSessionState) {
    const status = statusLine(session);
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
        {working && (
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
        {this._renderBanners(session)}
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
    return (
      <div className="ap-request">
        <Markdown text={pending.prompt} />
        {pending.choices && pending.choices.length > 0 && (
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
        )}
        <div className="ap-request-hint">Or type an answer below.</div>
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

  _renderComposer(session: AgentSessionState) {
    const pending = session.pendingRequest;
    const placeholder =
      pending && pending.kind === 'question'
        ? 'Type your answer…'
        : session.transcript.length
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
    const { session, geometry, dragDepth } = this.state;
    if (!session) return null;

    const style: React.CSSProperties = {
      right: geometry.right,
      bottom: geometry.bottom,
      width: geometry.collapsed ? Math.min(COLLAPSED_WIDTH, geometry.width) : geometry.width,
      height: geometry.collapsed ? COLLAPSED_HEIGHT : geometry.height,
    };

    return (
      <div
        className={classnames('views-authoring-panel', {
          collapsed: geometry.collapsed,
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
