import React from 'react';
import { MessageStore, Thread, Message } from 'mailspring-exports';
import { ViewHost } from './view-host';
import { ViewBridge } from './view-bridge';
import { serializeThreadSummary, serializeMessageSummary } from './bridge/serializers';
import { ViewManifest } from './view-registry';

const MIN_HEIGHT = 32;
const MAX_HEIGHT = 900;
const INITIAL_HEIGHT = 120;

interface SidebarViewState {
  height: number;
  hasContext: boolean;
}

/**
 * Builds the component that hosts one thread-sidebar View in the MessageListSidebar
 * location. It stays mounted while the reading pane is open, so the View's page lives across
 * thread changes and receives each newly focused thread as a `context` event rather than
 * reloading.
 */
export function createSidebarViewComponent(view: ViewManifest) {
  return class SidebarView extends React.Component<Record<string, unknown>, SidebarViewState> {
    static displayName = `SidebarView:${view.id}`;
    static containerStyles = { flexShrink: 0 };

    _host: ViewHost;
    _unlisten: () => void;
    state: SidebarViewState = { height: INITIAL_HEIGHT, hasContext: false };

    // The runtime reports its content height whenever it changes. Clamped so a View can't
    // push the rest of the sidebar off screen or collapse to nothing.
    _handlers = {
      'ui.setHeight': (ctx, { px }) => {
        if (typeof px !== 'number' || !isFinite(px)) return null;
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

    componentWillUnmount() {
      this._unlisten();
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
    _pushContext = (bridge: ViewBridge) => {
      if (!bridge) return;
      const context = this._contextFor(bridge.grant);
      const json = JSON.stringify(context);
      if (json === this._lastContextJSON) return;
      this._lastContextJSON = json;
      bridge.emit('context', context);
      bridge.emit('visibility', { visible: !!context });
      if (!!context !== this.state.hasContext) this.setState({ hasContext: !!context });
    };

    _onReady = (bridge: ViewBridge) => {
      this._lastContextJSON = '';
      this._pushContext(bridge);
    };

    render() {
      return (
        // Hidden rather than unmounted with no thread open, so the page survives until the
        // next one.
        <div
          className="sidebar-view"
          style={{ height: this.state.height, display: this.state.hasContext ? 'flex' : 'none' }}
        >
          <ViewHost
            ref={(el) => (this._host = el)}
            viewId={view.id}
            placement="thread-sidebar"
            handlers={this._handlers}
            onReady={this._onReady}
          />
        </div>
      );
    }
  };
}
