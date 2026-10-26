import React from 'react';
import classnames from 'classnames';
import { localized } from 'mailspring-exports';
import { SVGIcons } from 'mailspring-component-kit';
import { ViewsNavStore } from '../views-nav';
import { ViewRegistryEvents, allViews } from '../view-registry';
import { isPinned, onPinsChanged, setPinned } from './pins';

interface PinViewButtonState {
  viewId: string | null;
  pinned: boolean;
}

/** ViewPage toolbar button that pins the page View on screen to the nav rail, or unpins it. */
export class PinViewButton extends React.Component<Record<string, unknown>, PinViewButtonState> {
  static displayName = 'PinViewButton';

  _unlisteners: (() => void)[] = [];
  state = this.stateFromStores();

  // A View the agent hasn't built yet has nothing to pin.
  stateFromStores(): PinViewButtonState {
    const viewId = ViewsNavStore.viewId();
    const view = viewId && allViews().find((v) => v.id === viewId);
    if (!view || !view.built) return { viewId: null, pinned: false };
    return { viewId, pinned: isPinned(viewId) };
  }

  componentDidMount() {
    const update = () => this.setState(this.stateFromStores());
    ViewRegistryEvents.on('changed', update);
    this._unlisteners = [
      ViewsNavStore.listen(update),
      onPinsChanged(update),
      () => ViewRegistryEvents.removeListener('changed', update),
    ];
  }

  componentWillUnmount() {
    this._unlisteners.forEach((unlisten) => unlisten());
  }

  render() {
    const { viewId, pinned } = this.state;
    if (!viewId) return null;
    const label = pinned ? localized('Unpin from navigation') : localized('Pin to navigation');
    return (
      <button
        tabIndex={-1}
        className={classnames('btn btn-toolbar view-pin-button', { pinned })}
        style={{ order: 100 }}
        title={label}
        aria-label={label}
        aria-pressed={pinned}
        onClick={() => setPinned(viewId, !pinned)}
      >
        <SVGIcons.Pin filled={pinned} />
      </button>
    );
  }
}
