import React from 'react';
import { Actions, FocusedContentStore, FocusedPerspectiveStore } from 'mailspring-exports';
import { ViewHost } from './view-host';
import { ViewMailboxPerspective } from './view-mailbox-perspective';

interface ViewsRootState {
  viewId: string | null;
}

function focusedViewId() {
  const perspective = FocusedPerspectiveStore.current();
  return perspective instanceof ViewMailboxPerspective ? perspective.viewId : null;
}

/**
 * Content of the Views sheet: the focused page View, full width. A View opens a thread with
 * `ui.showThread`, which focuses it; the Views sheet only supports `list` mode, so
 * WorkspaceStore pushes the standard Thread sheet on top and the toolbar's Back button pops
 * it. The Views sheet stays mounted underneath, so the View keeps its state.
 */
export class ViewsRoot extends React.Component<Record<string, never>, ViewsRootState> {
  static displayName = 'ViewsRoot';
  static containerStyles = { minWidth: 400, flex: 1 };

  _unlisten: () => void;
  state: ViewsRootState = { viewId: focusedViewId() };

  componentDidMount() {
    // A thread focused in the mailbox would otherwise open the moment the View focuses it
    // again, without a push.
    clearFocusedThread();
    this._unlisten = FocusedPerspectiveStore.listen(() => {
      const viewId = focusedViewId();
      if (viewId && viewId !== this.state.viewId) this.setState({ viewId });
    });
  }

  componentWillUnmount() {
    this._unlisten();
    clearFocusedThread();
  }

  render() {
    const { viewId } = this.state;
    return (
      <div className="views-root">
        {viewId ? <ViewHost key={viewId} viewId={viewId} placement="page" /> : null}
      </div>
    );
  }
}

function clearFocusedThread() {
  if (FocusedContentStore.focused('thread')) {
    Actions.setFocus({ collection: 'thread', item: null });
  }
}
