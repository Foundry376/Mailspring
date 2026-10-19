import React from 'react';
import { localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { ViewsNavStore } from '../views-nav';
import { ViewRegistryEvents, allViews } from '../view-registry';
import { REVISIONS_CONFIG_KEY, acceptedAgentRevision } from '../agent/store';
import { shareableRevision } from './publish';
import { openShareSheet } from './share-sheet';

/** Whether the View has an agent revision that can be shared (see shareableRevision). */
export function canShare(viewId: string | null) {
  const view = viewId && allViews().find((v) => v.id === viewId);
  return !!view && shareableRevision(view, acceptedAgentRevision(view.id)) > 0;
}

/** ViewPage toolbar button that opens the share sheet for the page View on screen. */
export class ShareViewButton extends React.Component<
  Record<string, unknown>,
  { viewId: string | null }
> {
  static displayName = 'ShareViewButton';

  _unlisteners: (() => void)[] = [];
  state = this.stateFromStores();

  stateFromStores() {
    const viewId = ViewsNavStore.viewId();
    return { viewId: canShare(viewId) ? viewId : null };
  }

  componentDidMount() {
    const update = () => this.setState(this.stateFromStores());
    ViewRegistryEvents.on('changed', update);
    const config = AppEnv.config.onDidChange(REVISIONS_CONFIG_KEY, update);
    this._unlisteners = [
      ViewsNavStore.listen(update),
      () => ViewRegistryEvents.removeListener('changed', update),
      () => config.dispose(),
    ];
  }

  componentWillUnmount() {
    this._unlisteners.forEach((unlisten) => unlisten());
  }

  render() {
    const { viewId } = this.state;
    if (!viewId) return null;
    const label = localized('Share');
    return (
      <button
        tabIndex={-1}
        className="btn btn-toolbar"
        style={{ order: 99 }}
        title={label}
        aria-label={label}
        onClick={() => openShareSheet(viewId)}
      >
        <RetinaImg name="ic-toolbar-native-share.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}
