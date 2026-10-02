import React from 'react';
import {
  localized,
  Actions,
  FocusedContentStore,
  FocusedPerspectiveStore,
  WorkspaceStore,
} from 'mailspring-exports';
import { InjectedComponentSet, RetinaImg } from 'mailspring-component-kit';
import { ResizableRegion, ResizableHandle } from '../../../src/components/resizable-region';
import { ViewHost } from './view-host';
import { ViewMailboxPerspective } from './view-mailbox-perspective';

const PANE_WIDTH_KEY = 'ViewReadingPane';
const PANE_HEIGHT_KEY = 'ViewReadingPaneVertical';

interface ViewsRootState {
  viewId: string | null;
  mode: string;
  threadFocused: boolean;
  collapsed: boolean;
}

function focusedViewId() {
  const perspective = FocusedPerspectiveStore.current();
  return perspective instanceof ViewMailboxPerspective ? perspective.viewId : null;
}

/**
 * Content of the Views sheet: the focused page View, plus a reading pane that appears when the
 * View calls `ui.showThread`. The pane follows the user's layout preference:
 *
 * - `list`: no pane. WorkspaceStore pushes the standard Thread sheet over the View, exactly as
 *   it does over the thread list, and Back returns to the View.
 * - `split`: the pane opens to the right of the View.
 * - `splitVertical`: the pane opens below the View.
 *
 * The pane hosts the real MessageList, its toolbar, and MessageListSidebar components, so
 * Views get the standard reading experience (and every plugin that decorates it) for free.
 */
export class ViewsRoot extends React.Component<Record<string, never>, ViewsRootState> {
  static displayName = 'ViewsRoot';
  static containerStyles = { minWidth: 400, flex: 1 };

  _unlisteners: (() => void)[] = [];
  state: ViewsRootState = {
    viewId: focusedViewId(),
    mode: WorkspaceStore.layoutMode(),
    threadFocused: !!FocusedContentStore.focused('thread'),
    collapsed: false,
  };

  componentDidMount() {
    this._unlisteners = [
      FocusedPerspectiveStore.listen(() => {
        const viewId = focusedViewId();
        if (viewId && viewId !== this.state.viewId) this.setState({ viewId });
      }),
      FocusedContentStore.listen(() => {
        const threadFocused = !!FocusedContentStore.focused('thread');
        if (threadFocused === this.state.threadFocused) return;
        // Opening another thread re-expands a collapsed pane; the View asked to show it.
        this.setState({ threadFocused, collapsed: false });
      }),
      WorkspaceStore.listen(() => {
        const mode = WorkspaceStore.layoutMode();
        if (mode !== this.state.mode) this.setState({ mode });
      }),
    ];
  }

  componentWillUnmount() {
    this._unlisteners.forEach((u) => u());
    // Leaving the sheet shouldn't leave a thread focused that no pane is showing.
    if (FocusedContentStore.focused('thread')) {
      Actions.setFocus({ collection: 'thread', item: null });
    }
  }

  _onClose = () => Actions.setFocus({ collection: 'thread', item: null });
  _onToggleCollapsed = () => this.setState({ collapsed: !this.state.collapsed });

  _renderPaneHeader() {
    const vertical = this.state.mode === 'splitVertical';
    return (
      <div className="sheet-toolbar view-reading-pane-toolbar">
        <InjectedComponentSet
          matching={{ location: WorkspaceStore.Location.MessageList.Toolbar, modes: ['split'] }}
        />
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-toolbar"
          title={localized('Collapse')}
          onClick={this._onToggleCollapsed}
        >
          <RetinaImg
            name="toolbar-chevron.png"
            mode={RetinaImg.Mode.ContentIsMask}
            style={vertical ? {} : { transform: 'rotate(-90deg)' }}
          />
        </button>
        <button className="btn btn-toolbar" title={localized('Close')} onClick={this._onClose}>
          <RetinaImg name="ic-findinthread-close.png" mode={RetinaImg.Mode.ContentIsMask} />
        </button>
      </div>
    );
  }

  _renderPane() {
    const { mode, threadFocused, collapsed } = this.state;
    if (!threadFocused || mode === 'list') return null;

    if (collapsed) {
      return (
        <div
          className={`view-reading-pane-rail mode-${mode}`}
          title={localized('Show conversation')}
          onClick={this._onToggleCollapsed}
        >
          <RetinaImg
            name="toolbar-chevron.png"
            mode={RetinaImg.Mode.ContentIsMask}
            style={{ transform: mode === 'splitVertical' ? 'rotate(180deg)' : 'rotate(90deg)' }}
          />
        </div>
      );
    }

    const content = (
      <div className="view-reading-pane">
        {this._renderPaneHeader()}
        <div className="view-reading-pane-body">
          <InjectedComponentSet
            className="view-reading-pane-messages"
            matching={{ location: WorkspaceStore.Location.MessageList, modes: ['split'] }}
          />
          {mode === 'split' && (
            <InjectedComponentSet
              className="view-reading-pane-sidebar"
              direction="column"
              matching={{ location: WorkspaceStore.Location.MessageListSidebar, modes: ['split'] }}
            />
          )}
        </div>
      </div>
    );

    if (mode === 'splitVertical') {
      return (
        <ResizableRegion
          className="view-reading-pane-region"
          handle={ResizableHandle.Top}
          minHeight={200}
          initialHeight={AppEnv.getColumnWidth(PANE_HEIGHT_KEY) || 420}
          onResize={(h) => AppEnv.storeColumnWidth({ id: PANE_HEIGHT_KEY, width: h })}
        >
          {content}
        </ResizableRegion>
      );
    }
    return (
      <ResizableRegion
        className="view-reading-pane-region"
        handle={ResizableHandle.Left}
        minWidth={420}
        initialWidth={AppEnv.getColumnWidth(PANE_WIDTH_KEY) || 720}
        onResize={(w) => AppEnv.storeColumnWidth({ id: PANE_WIDTH_KEY, width: w })}
      >
        {content}
      </ResizableRegion>
    );
  }

  render() {
    const { viewId, mode } = this.state;
    return (
      <div className={`views-root mode-${mode}`}>
        {viewId ? <ViewHost key={viewId} viewId={viewId} placement="page" /> : null}
        {this._renderPane()}
      </div>
    );
  }
}
