import React from 'react';
import { localized } from 'mailspring-exports';
import { ViewBridge } from './view-bridge';

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
}

/**
 * Mounts one View in a `<webview>` on its own `persist:view-<viewId>` partition. The main
 * process locks that session down when the webview attaches (app/src/browser/view-sessions.ts);
 * this component only creates the element, connects its bridge, and covers it with a
 * Reload/Close card if the guest crashes or hangs.
 */
export class ViewHost extends React.Component<ViewHostProps, ViewHostState> {
  static displayName = 'ViewHost';

  _container: HTMLDivElement;
  _webview: Electron.WebviewTag;
  _bridge: ViewBridge;

  state: ViewHostState = { status: 'running' };

  get bridge() {
    return this._bridge;
  }

  componentDidMount() {
    this._mount();
  }

  componentDidUpdate(prevProps: ViewHostProps) {
    if (prevProps.viewId !== this.props.viewId) {
      this._unmount();
      this._mount();
    }
  }

  componentWillUnmount() {
    this._unmount();
  }

  // The partition must be set before the element is attached; it can't change afterwards.
  // The placement rides in the fragment, which the runtime reads and the protocol handler
  // never sees.
  _mount() {
    const { viewId, placement, handlers } = this.props;
    const webview = document.createElement('webview') as Electron.WebviewTag;
    webview.setAttribute('partition', `persist:view-${viewId}`);
    webview.setAttribute('src', `mailspring-view://${viewId}/#placement=${placement}`);
    webview.addEventListener('dom-ready', this._onDomReady);
    webview.addEventListener('render-process-gone', this._onGone);
    webview.addEventListener('unresponsive', this._onUnresponsive);
    webview.addEventListener('responsive', this._onResponsive);
    this._bridge = new ViewBridge(viewId, webview, { handlers });
    this._webview = webview;
    this._container.appendChild(webview);
    this.setState({ status: 'running' });
  }

  _unmount() {
    if (this._bridge) this._bridge.dispose();
    if (this._webview) this._webview.remove();
    this._bridge = null;
    this._webview = null;
  }

  _onDomReady = () => {
    if (this.props.onReady && this._bridge) this.props.onReady(this._bridge);
  };

  _onGone = () => this.setState({ status: 'crashed' });
  _onUnresponsive = () => this.setState({ status: 'unresponsive' });
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

  render() {
    return (
      <div className={`view-host placement-${this.props.placement}`} style={this.props.style}>
        <div className="view-host-webview" ref={(el) => (this._container = el)} />
        {this._renderCover()}
      </div>
    );
  }
}
