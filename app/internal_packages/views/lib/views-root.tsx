import React from 'react';
import { Actions, FocusedContentStore } from 'mailspring-exports';
import { ViewHost } from './view-host';
import { ViewsNavStore } from './views-nav';
import { ViewsHome } from './home/views-home';
import { EditViewButton } from './authoring-panel';

interface ViewsRootState {
  viewId: string | null;
  home: boolean;
}

function focusedState(): ViewsRootState {
  const viewId = ViewsNavStore.viewId();
  return { viewId, home: !viewId };
}

/**
 * Content of the Views sheet: the Views home, or the focused page View, full width. A View
 * opens a thread with `ui.showThread`, which focuses it; the Views sheet only supports `list`
 * mode, so WorkspaceStore pushes the standard Thread sheet on top and the toolbar's Back
 * button pops it. The Views sheet stays mounted underneath, so the View keeps its state.
 */
export class ViewsRoot extends React.Component<Record<string, never>, ViewsRootState> {
  static displayName = 'ViewsRoot';
  static containerStyles = { minWidth: 400, flex: 1 };

  _unlisten: () => void;
  state: ViewsRootState = focusedState();

  componentDidMount() {
    // A thread focused in the mailbox would otherwise open the moment the View focuses it
    // again, without a push.
    clearFocusedThread();
    this._unlisten = ViewsNavStore.listen(() => {
      const next = focusedState();
      if (next.viewId !== this.state.viewId || next.home !== this.state.home) {
        this.setState(next);
      }
    });
  }

  componentWillUnmount() {
    this._unlisten();
    clearFocusedThread();
  }

  render() {
    const { viewId, home } = this.state;
    if (home) return <ViewsHome />;
    return (
      <div className="views-root">
        {viewId ? <ViewHost key={viewId} viewId={viewId} placement="page" /> : null}
        {viewId ? <EditViewButton key={`edit-${viewId}`} viewId={viewId} variant="page" /> : null}
      </div>
    );
  }
}

function clearFocusedThread() {
  if (FocusedContentStore.focused('thread')) {
    Actions.setFocus({ collection: 'thread', item: null });
  }
}
