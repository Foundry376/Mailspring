import React from 'react';
import { localized } from 'mailspring-exports';
import { ViewsNavStore } from '../views-nav';
import { ViewRegistryEvents, allViews } from '../view-registry';
import { REVISIONS_CONFIG_KEY, acceptedAgentRevision } from '../agent/store';
import { shareableRevision } from './publish';
import { openShareSheet } from './share-sheet';

const ShareIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M10 12.5V3m0 0L6.5 6.5M10 3l3.5 3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 9.5H5a1.5 1.5 0 0 0-1.5 1.5v4.5A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5V11A1.5 1.5 0 0 0 15 9.5h-1"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

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
        className="btn btn-toolbar view-share-button"
        style={{ order: 99 }}
        title={label}
        aria-label={label}
        onClick={() => openShareSheet(viewId)}
      >
        <ShareIcon />
      </button>
    );
  }
}
