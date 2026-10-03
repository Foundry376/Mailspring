import React from 'react';
import { MessageStore, Thread, Message } from 'mailspring-exports';
import { ViewHost } from './view-host';
import { ViewBridge } from './view-bridge';
import { serializeThreadSummary, serializeMessageSummary } from './bridge/serializers';
import { ViewManifest } from './view-registry';
import { sidebarOptionsFor } from './sidebar/sidebar-options';
import { EditViewButton } from './authoring-panel/edit-view-button';

const MIN_HEIGHT = 32;
const MAX_HEIGHT = 900;
const INITIAL_HEIGHT = 120;

interface SidebarViewProps {
  // Passed by the sidebar panel switcher to panel-mode Views; card-mode Views are always
  // "active" while the Contact panel shows.
  active?: boolean;
}

interface SidebarViewState {
  height: number;
  hasContext: boolean;
}

/**
 * Builds the component that hosts one thread-sidebar View. It stays mounted while the reading
 * pane is open, so the View's page lives across thread changes and receives each newly
 * focused thread as a `context` event rather than reloading.
 *
 * In `card` mode the host draws the same `.sidebar-section` chrome as the contact card around
 * the View, so a View with no styling of its own looks native. In `panel` mode the component
 * carries a static `sidebarPanel` and is registered for the `MessageListSidebar:Panel` role;
 * the switcher at the top of the sidebar shows it full height in place of the contact cards.
 */
export function createSidebarViewComponent(view: ViewManifest) {
  const options = sidebarOptionsFor(view);
  const isPanel = options.mode === 'panel';

  return class SidebarView extends React.Component<SidebarViewProps, SidebarViewState> {
    static displayName = `SidebarView:${view.id}`;
    static containerStyles = { flexShrink: 0 };
    static sidebarPanel = isPanel
      ? { id: `view:${view.id}`, title: options.title || view.name }
      : undefined;

    _host: ViewHost;
    _unlisten: () => void;
    state: SidebarViewState = { height: INITIAL_HEIGHT, hasContext: false };

    // Card Views report their content height whenever it changes. Clamped so a View can't push
    // the rest of the sidebar off screen or collapse to nothing. Panels fill the sidebar, so
    // the report is ignored.
    _handlers = {
      'ui.setHeight': (ctx, { px }) => {
        if (isPanel || typeof px !== 'number' || !isFinite(px)) return null;
        const height = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, px)));
        if (height !== this.state.height) this.setState({ height });
        return null;
      },
      // Lets the runtime fetch the current context on mount; pushes after that are events.
      'context.get': (ctx) => this._contextFor(ctx.grant),
    };

    componentDidMount() {
      this._unlisten = MessageStore.listen(() =>
        this._pushContext(this._host && this._host.bridge)
      );
    }

    componentDidUpdate(prevProps: SidebarViewProps) {
      if (this._isActive(prevProps) !== this._isActive(this.props)) this._pushVisibility();
    }

    componentWillUnmount() {
      this._unlisten();
    }

    _isActive(props: SidebarViewProps) {
      return !isPanel || props.active !== false;
    }

    _contextFor(grant) {
      const thread: Thread = MessageStore.thread();
      if (!thread) return null;
      const summary = serializeThreadSummary(grant, thread);
      if (!summary) return null;
      const messages = (MessageStore.items() as Message[])
        .map((m) => serializeMessageSummary(grant, m))
        .filter(Boolean);
      return { thread: summary, messages };
    }

    // MessageStore triggers several times while a thread loads (thread, then messages, then
    // bodies); pushing only when the serialized context changes keeps that to one event.
    _lastContextJSON = '';
    _lastVisible: boolean | null = null;

    _pushContext = (bridge: ViewBridge) => {
      if (!bridge) return;
      const context = this._contextFor(bridge.grant);
      const json = JSON.stringify(context);
      if (json === this._lastContextJSON) return;
      this._lastContextJSON = json;
      bridge.emit('context', context);
      if (!!context !== this.state.hasContext) {
        this.setState({ hasContext: !!context }, this._pushVisibility);
      } else {
        this._pushVisibility();
      }
    };

    // Hidden panels and thread-less sidebars pause the View's subscription pushes host-side.
    _pushVisibility = () => {
      const bridge = this._host && this._host.bridge;
      if (!bridge) return;
      const visible = this.state.hasContext && this._isActive(this.props);
      if (visible === this._lastVisible) return;
      this._lastVisible = visible;
      bridge.emit('visibility', { visible });
    };

    _onReady = (bridge: ViewBridge) => {
      this._lastContextJSON = '';
      this._lastVisible = null;
      this._pushContext(bridge);
      this._pushVisibility();
    };

    _renderHost() {
      return (
        <ViewHost
          ref={(el) => (this._host = el)}
          viewId={view.id}
          placement="thread-sidebar"
          handlers={this._handlers}
          onReady={this._onReady}
        />
      );
    }

    render() {
      // Hidden rather than unmounted with no thread open, so the page survives until the next
      // one.
      const display = this.state.hasContext ? 'flex' : 'none';

      if (isPanel) {
        return (
          <div className="sidebar-view sidebar-view-panel" style={{ display }}>
            {this._renderHost()}
            <EditViewButton viewId={view.id} variant="sidebar" />
          </div>
        );
      }
      return (
        <aside
          className="sidebar-section visible sidebar-view sidebar-view-card"
          aria-label={options.title || view.name}
          style={{ display: this.state.hasContext ? 'block' : 'none' }}
        >
          {options.title && <h2>{options.title}</h2>}
          <div className="sidebar-view-frame" style={{ height: this.state.height }}>
            {this._renderHost()}
          </div>
          <EditViewButton viewId={view.id} variant="sidebar" />
        </aside>
      );
    }
  };
}
