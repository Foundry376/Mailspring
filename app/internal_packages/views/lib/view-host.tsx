import React from 'react';
import { ipcRenderer } from 'electron';
import { localized } from 'mailspring-exports';
import { ViewBridge } from './view-bridge';
import { registerHost } from './authoring/hosts';
import { ViewDiagnostics, reportFromGuest, summarizeParams } from './authoring/diagnostics';
import { ApiCompatibility, CURRENT_API_VERSION, compatibility, rebuildRequest } from './api-version';
import { ViewRegistryEvents, ViewsChange, installedViews } from './view-registry';

export type ViewPlacement = 'page' | 'thread-sidebar';

type HostStatus = 'running' | 'unresponsive' | 'crashed' | 'closed';

interface ViewHostProps {
  viewId: string;
  placement: ViewPlacement;
  // Extra bridge handlers for this placement (e.g. `ui.setHeight` for sidebar Views).
  handlers?: { [method: string]: (ctx: any, params: any) => any };
  // Called after the guest page loads, including after a reload or crash recovery, so the
  // owner can push state the new page hasn't seen (sidebar context, visibility).
  onReady?: (bridge: ViewBridge) => void;
  style?: React.CSSProperties;
}

interface ViewHostState {
  status: HostStatus;
  /** Whether this build runs the View's declared API version; anything else shows a card. */
  compat: { result: ApiCompatibility; version: string };
  issues: number;
  hovering: boolean;
}

// The loader prefixes what it logs itself; those errors already arrive as structured
// `view.diagnostic` reports, so the console copy is skipped.
const LOADER_LOG_PREFIX = '[mailspring-view]';

// Shared with app/src/browser/view-sessions.ts, whose hang watchdog only judges guests the
// host reports as on screen.
const VISIBILITY_CHANNEL = 'mailspring-view:visibility';
const WATCHDOG_KILL_CHANNEL = 'mailspring-view:watchdog-kill';

// Electron reports console levels as names in recent versions and as numbers before that.
function consoleLevel(level: any): 'warning' | 'error' | null {
  if (level === 'error' || level === 3) return 'error';
  if (level === 'warning' || level === 2) return 'warning';
  return null;
}

/**
 * Mounts one View in a `<webview>` on its own `persist:view-<viewId>` partition. The main
 * process locks that session down when the webview attaches (app/src/browser/view-sessions.ts);
 * this component creates the element, connects its bridge, feeds the View's diagnostics
 * (lib/authoring/diagnostics.ts), and covers it with a Reload/Close card if the guest
 * crashes or hangs.
 *
 * Reloads keep the same webview and bridge: the bridge drops the old page's subscriptions
 * when the new page starts loading. Only a crashed or hung guest gets a fresh webview.
 */
export class ViewHost extends React.Component<ViewHostProps, ViewHostState> {
  static displayName = 'ViewHost';

  _container: HTMLDivElement;
  _webview: Electron.WebviewTag;
  _bridge: ViewBridge;
  _unregister: () => void;
  _unlistenDiagnostics: () => void;
  _visibilityObserver: IntersectionObserver;
  _guestId: number = null;
  _visible = true;
  _killedByWatchdog = false;

  state: ViewHostState = {
    status: 'running',
    issues: 0,
    hovering: false,
    compat: { result: 'ok', version: CURRENT_API_VERSION },
  };

  get bridge() {
    return this._bridge;
  }

  get viewId() {
    return this.props.viewId;
  }

  componentDidMount() {
    this._unregister = registerHost(this);
    const onDiagnostic = (d) => {
      if (d.viewId !== this.props.viewId) return;
      if (d.kind === 'render-ok') this.setState({ issues: 0 });
      else if (d.level === 'error' || d.kind === 'crash' || d.kind === 'hang') {
        this.setState({ issues: this.state.issues + 1 });
      }
    };
    ViewDiagnostics.on('diagnostic', onDiagnostic);
    this._unlistenDiagnostics = () => ViewDiagnostics.removeListener('diagnostic', onDiagnostic);
    ipcRenderer.on(WATCHDOG_KILL_CHANNEL, this._onWatchdogKill);
    // A host inside a display:none ancestor (a sidebar View with no thread open, an
    // unselected panel) never intersects, which is exactly "not on screen".
    this._visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      this._visible = !!entry && entry.isIntersecting;
      this._reportVisibility();
    });
    this._visibilityObserver.observe(this._container);
    ViewRegistryEvents.on('changed', this._onViewsChanged);
    this._mount();
  }

  /** Reads the View's declared API version from its manifest on disk. */
  _readCompat() {
    const view = installedViews().find((v) => v.id === this.props.viewId);
    const version = view ? view.apiVersion : CURRENT_API_VERSION;
    return { result: compatibility(version), version };
  }

  // A rebuilt (or hand-edited) manifest can move a View into or out of the supported range.
  _onViewsChanged = ({ viewIds, structural }: ViewsChange) => {
    if (!structural || !viewIds.includes(this.props.viewId)) return;
    const next = this._readCompat();
    if (next.result === this.state.compat.result && next.version === this.state.compat.version) {
      return;
    }
    this._unmount();
    this._mount();
  };

  _reportVisibility() {
    if (this._guestId !== null) {
      ipcRenderer.send(VISIBILITY_CHANNEL, this._guestId, this._visible);
    }
  }

  _onWatchdogKill = (_event, guestId: number) => {
    if (guestId !== this._guestId) return;
    this._killedByWatchdog = true;
    ViewDiagnostics.add({
      viewId: this.props.viewId,
      kind: 'hang',
      level: 'error',
      message: 'The View stopped answering for 15 seconds while on screen and was stopped.',
    });
  };

  componentDidUpdate(prevProps: ViewHostProps) {
    if (prevProps.viewId !== this.props.viewId) {
      this._unmount();
      this._mount();
    }
  }

  componentWillUnmount() {
    this._unregister();
    this._unlistenDiagnostics();
    this._visibilityObserver.disconnect();
    ipcRenderer.removeListener(WATCHDOG_KILL_CHANNEL, this._onWatchdogKill);
    ViewRegistryEvents.removeListener('changed', this._onViewsChanged);
    this._unmount();
  }

  /** Reloads the View's page in place; the host layout around it is untouched. */
  reloadView() {
    if (this.state.status !== 'running' || !this._webview) {
      this._onReload();
      return;
    }
    try {
      this._webview.reloadIgnoringCache();
    } catch {
      // Not attached yet; it will load the current code when it does.
    }
  }

  capturePage(): Promise<Electron.NativeImage | null> {
    if (!this._webview || this.state.status !== 'running') return Promise.resolve(null);
    return this._webview.capturePage().catch(() => null);
  }

  openDevTools() {
    if (this._webview) this._webview.openDevTools();
  }

  _guestHandlers() {
    const { viewId, handlers } = this.props;
    return {
      ...(handlers || {}),
      'view.diagnostic': (ctx, params) => {
        reportFromGuest(viewId, params);
        return null;
      },
    };
  }

  // The partition must be set before the element is attached; it can't change afterwards.
  // The placement rides in the fragment, which the runtime reads and the protocol handler
  // never sees.
  _mount() {
    const { viewId, placement } = this.props;
    const compat = this._readCompat();
    // Out-of-range Views never load: their code may call APIs this build doesn't have, or
    // rely on behavior it no longer has. The card offers a rebuild instead.
    if (compat.result !== 'ok') {
      this.setState({ compat, status: 'running' });
      return;
    }
    const webview = document.createElement('webview') as Electron.WebviewTag;
    webview.setAttribute('partition', `persist:view-${viewId}`);
    const fragment = new URLSearchParams({ placement, apiVersion: compat.version });
    webview.setAttribute('src', `mailspring-view://${viewId}/#${fragment.toString()}`);
    webview.addEventListener('did-start-navigation', this._onStartNavigation as any);
    webview.addEventListener('dom-ready', this._onDomReady);
    webview.addEventListener('console-message', this._onConsoleMessage as any);
    webview.addEventListener('render-process-gone', this._onGone as any);
    webview.addEventListener('unresponsive', this._onUnresponsive);
    webview.addEventListener('responsive', this._onResponsive);
    this._bridge = new ViewBridge(viewId, webview, {
      handlers: this._guestHandlers(),
      onCallError: (method, error, params) =>
        ViewDiagnostics.add({
          viewId,
          kind: 'bridge-error',
          level: 'error',
          method,
          code: error.code,
          message: error.message,
          params: summarizeParams(params),
        }),
    });
    this._webview = webview;
    this._container.appendChild(webview);
    this.setState({ status: 'running', compat });
  }

  _unmount() {
    this._guestId = null;
    if (this._bridge) this._bridge.dispose();
    if (this._webview) this._webview.remove();
    this._bridge = null;
    this._webview = null;
  }

  // Fires before the new page runs any script, so its first calls find a clean bridge.
  // Same-document navigations (hash changes) keep the page and its subscriptions.
  _onStartNavigation = (event: { isMainFrame: boolean; isInPlace: boolean }) => {
    if (!event.isMainFrame || event.isInPlace || !this._bridge) return;
    this._bridge.resetPage();
    this.setState({ issues: 0 });
  };

  _onDomReady = () => {
    if (this._webview && this._guestId === null) {
      this._guestId = this._webview.getWebContentsId();
      this._reportVisibility();
    }
    if (this.props.onReady && this._bridge) this.props.onReady(this._bridge);
  };

  _onConsoleMessage = (event: { level: any; message: string; sourceId: string; line: number }) => {
    const level = consoleLevel(event.level);
    if (!level || (event.message || '').startsWith(LOADER_LOG_PREFIX)) return;
    ViewDiagnostics.add({
      viewId: this.props.viewId,
      kind: 'console',
      level,
      message: event.message,
      stack: event.sourceId ? `at ${event.sourceId}:${event.line}` : undefined,
      untrusted: true,
    });
  };

  _onGone = (event: { reason?: string; details?: { reason?: string } }) => {
    const reason = event.reason || (event.details && event.details.reason) || 'unknown';
    if (this._killedByWatchdog) {
      // Already recorded as a hang.
      this._killedByWatchdog = false;
      this.setState({ status: 'unresponsive' });
      return;
    }
    ViewDiagnostics.add({
      viewId: this.props.viewId,
      kind: 'crash',
      level: 'error',
      message: `The View's process exited (${reason}).`,
    });
    this.setState({ status: 'crashed' });
  };

  _onUnresponsive = () => {
    ViewDiagnostics.add({
      viewId: this.props.viewId,
      kind: 'hang',
      level: 'error',
      message: 'The View stopped responding.',
    });
    this.setState({ status: 'unresponsive' });
  };

  _onResponsive = () => {
    if (this.state.status === 'unresponsive') this.setState({ status: 'running' });
  };

  // A crashed guest can't be reloaded in place, and a hung one may never answer, so both
  // get a fresh webview. The bridge goes with it, dropping the dead page's subscriptions.
  _onReload = () => {
    this._unmount();
    this._mount();
  };

  _onClose = () => {
    this._unmount();
    this.setState({ status: 'closed' });
  };

  _onRebuild = () => {
    // Required lazily: the panel package requires this module through the Views root.
    const { openPanelWithMessage } = require('./authoring-panel');
    openPanelWithMessage(this.props.viewId, rebuildRequest(this.state.compat.version));
  };

  _onRemove = () => {
    const { removeView } = require('./home/view-actions');
    removeView(this.props.viewId);
  };

  _renderVersionCard() {
    const { result } = this.state.compat;
    if (result === 'ok') return null;
    const tooOld = result === 'too-old';
    return (
      <div className="view-host-cover view-host-version">
        <div className="view-host-cover-title">
          {tooOld
            ? localized('This View was built for an older version of Mailspring.')
            : localized('This View needs a newer version of Mailspring.')}
        </div>
        <div className="view-host-cover-detail">
          {tooOld
            ? localized('Rebuild it with AI to update it, or remove it.')
            : localized('Update Mailspring to use it.')}
        </div>
        <div className="view-host-cover-actions">
          {tooOld && (
            <button className="btn btn-emphasis" onClick={this._onRebuild}>
              {localized('Rebuild with AI')}
            </button>
          )}
          <button className="btn" onClick={this._onRemove}>
            {localized('Remove')}
          </button>
        </div>
      </div>
    );
  }

  _renderCover() {
    const { status } = this.state;
    if (status === 'running') return null;

    const title = {
      crashed: localized('This View stopped unexpectedly.'),
      unresponsive: localized('This View is not responding.'),
      closed: localized('This View is closed.'),
    }[status];

    return (
      <div className="view-host-cover">
        <div className="view-host-cover-title">{title}</div>
        <div className="view-host-cover-actions">
          <button className="btn" onClick={this._onReload}>
            {status === 'closed' ? localized('Open') : localized('Reload')}
          </button>
          {status !== 'closed' && (
            <button className="btn" onClick={this._onClose}>
              {localized('Close')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Dev mode only: reload and DevTools for the View, and a count of errors since its page
  // loaded. Shown only while the pointer is over the View, so it never covers View content
  // otherwise. Styled inline because it exists only for development.
  _renderDevControls() {
    if (!AppEnv.inDevMode() || this.state.status !== 'running' || !this.state.hovering) {
      return null;
    }
    const { issues } = this.state;
    const button: React.CSSProperties = {
      border: 0,
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      padding: '0 4px',
      font: '11px/18px monospace',
    };
    return (
      <div
        className="view-host-dev-controls"
        style={{
          position: 'absolute',
          top: 4,
          right: 6,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          borderRadius: 4,
          background: 'rgba(127,127,127,0.18)',
          color: 'rgba(127,127,127,0.95)',
          opacity: issues ? 1 : 0.55,
        }}
      >
        {issues > 0 && (
          <span
            title={localized('Errors since the View loaded')}
            style={{ ...button, cursor: 'default', color: '#d0021b', fontWeight: 'bold' }}
          >
            {issues}
          </span>
        )}
        <button style={button} title={localized('Reload View')} onClick={() => this.reloadView()}>
          ↻
        </button>
        <button
          style={button}
          title={localized('Developer Tools')}
          onClick={() => this.openDevTools()}
        >
          {'</>'}
        </button>
      </div>
    );
  }

  render() {
    return (
      <div
        className={`view-host placement-${this.props.placement}`}
        style={this.props.style}
        onMouseEnter={AppEnv.inDevMode() ? () => this.setState({ hovering: true }) : undefined}
        onMouseLeave={AppEnv.inDevMode() ? () => this.setState({ hovering: false }) : undefined}
      >
        <div className="view-host-webview" ref={(el) => (this._container = el)} />
        {this._renderDevControls()}
        {this._renderVersionCard() || this._renderCover()}
      </div>
    );
  }
}
