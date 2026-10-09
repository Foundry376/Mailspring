import React from 'react';
import { Actions, FocusedContentStore } from 'mailspring-exports';
import { ViewHost } from './view-host';
import { ViewsNavStore } from './views-nav';
import { ViewsHome } from './home/views-home';
import { EditViewButton } from './authoring-panel';

/** Content of the Views root sheet: the Views home. */
export class ViewsRoot extends React.Component<Record<string, never>> {
  static displayName = 'ViewsRoot';
  static containerStyles = { minWidth: 400, flex: 1 };

  render() {
    return <ViewsHome />;
  }
}

interface ViewPageState {
  viewId: string | null;
}

/**
 * Content of the ViewPage sheet, which is pushed over the Views home: one page View, full
 * width. A View opens a thread with `ui.showThread`, which focuses it; the Views sheets only
 * support `list` mode, so WorkspaceStore pushes the Thread sheet on top and Back pops it. This
 * sheet stays mounted underneath, so the View keeps its state.
 */
export class ViewPageRoot extends React.Component<Record<string, never>, ViewPageState> {
  static displayName = 'ViewPageRoot';
  static containerStyles = { minWidth: 400, flex: 1 };

  _unlisten: () => void;
  state: ViewPageState = { viewId: ViewsNavStore.viewId() };

  componentDidMount() {
    // A thread focused in the mailbox would otherwise open the moment the View focuses it
    // again, without a push.
    clearFocusedThread();
    this._unlisten = ViewsNavStore.listen(() => {
      const viewId = ViewsNavStore.viewId();
      // Popping this sheet clears the store first; keep the View until the sheet unmounts.
      if (viewId && viewId !== this.state.viewId) this.setState({ viewId });
    });
  }

  componentWillUnmount() {
    this._unlisten();
    clearFocusedThread();
  }

  render() {
    const { viewId } = this.state;
    if (!viewId) return null;
    return (
      <div className="views-root">
        <ViewHost key={viewId} viewId={viewId} placement="page" />
        <EditViewButton key={`edit-${viewId}`} viewId={viewId} variant="page" />
      </div>
    );
  }
}

function clearFocusedThread() {
  if (FocusedContentStore.focused('thread')) {
    Actions.setFocus({ collection: 'thread', item: null });
  }
}
