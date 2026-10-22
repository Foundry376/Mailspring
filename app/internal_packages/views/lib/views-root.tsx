import React from 'react';
import { Actions, FocusedContentStore, localized } from 'mailspring-exports';
import { ViewRegistryEvents, allViews } from './view-registry';
import { ViewHost } from './view-host';
import { ViewsNavStore } from './views-nav';
import { ViewsHome } from './home/views-home';
import { EditViewButton, openPanelForView } from './authoring-panel';

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
  built: boolean;
}

function isBuilt(viewId: string | null) {
  const view = viewId && allViews().find((v) => v.id === viewId);
  return !!view && view.built;
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
  state: ViewPageState = {
    viewId: ViewsNavStore.viewId(),
    built: isBuilt(ViewsNavStore.viewId()),
  };

  componentDidMount() {
    // A thread focused in the mailbox would otherwise open the moment the View focuses it
    // again, without a push.
    clearFocusedThread();
    const unlistenNav = ViewsNavStore.listen(() => {
      const viewId = ViewsNavStore.viewId();
      // Popping this sheet clears the store first; keep the View until the sheet unmounts.
      if (viewId && viewId !== this.state.viewId) this.setState({ viewId, built: isBuilt(viewId) });
    });
    const onViewsChanged = () => this.setState({ built: isBuilt(this.state.viewId) });
    ViewRegistryEvents.on('changed', onViewsChanged);
    this._unlisten = () => {
      unlistenNav();
      ViewRegistryEvents.removeListener('changed', onViewsChanged);
    };
  }

  componentWillUnmount() {
    this._unlisten();
    clearFocusedThread();
  }

  render() {
    const { viewId, built } = this.state;
    if (!viewId) return null;
    if (!built) {
      return (
        <div className="views-root unbuilt">
          <div className="views-unbuilt-message">
            {localized('This View hasn’t been built yet.')}
            <button className="btn" onClick={() => openPanelForView(viewId)}>
              {localized('Open Chat')}
            </button>
          </div>
        </div>
      );
    }
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
