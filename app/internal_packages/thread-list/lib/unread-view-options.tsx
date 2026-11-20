import React from 'react';
import { Actions, ReactDOM, localized, FocusedPerspectiveStore } from 'mailspring-exports';
import { SVGIcons } from 'mailspring-component-kit';

// Read by UnreadQuerySubscription, set here and in Preferences > General.
const RELEASE_ON_NEXT_KEY = 'core.reading.unreadViewReleaseReadOnNext';

// The Unread view setting lives next to the view as well as in Preferences > General:
// people only care about it while working through Unread, so that is where they look.
class UnreadViewOptionsPopover extends React.Component<
  Record<string, unknown>,
  { releaseOnNext: boolean }
> {
  static displayName = 'UnreadViewOptionsPopover';

  _configDisposable: { dispose: () => void };

  state = { releaseOnNext: !!AppEnv.config.get(RELEASE_ON_NEXT_KEY) };

  componentDidMount() {
    this._configDisposable = AppEnv.config.onDidChange(RELEASE_ON_NEXT_KEY, ({ newValue }) =>
      this.setState({ releaseOnNext: !!newValue })
    );
  }

  componentWillUnmount() {
    this._configDisposable.dispose();
  }

  _onToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    AppEnv.config.set(RELEASE_ON_NEXT_KEY, e.target.checked);
  };

  render() {
    return (
      <div tabIndex={-1} className="unread-view-options-popover">
        <label htmlFor="unreadViewReleaseReadOnNext">
          <input
            type="checkbox"
            id="unreadViewReleaseReadOnNext"
            checked={this.state.releaseOnNext}
            onChange={this._onToggle}
          />
          {localized('Remove read threads from the Unread view when you open another thread')}
        </label>
      </div>
    );
  }
}

export class UnreadViewOptionsButton extends React.Component<
  Record<string, unknown>,
  { isUnreadView: boolean }
> {
  static displayName = 'UnreadViewOptionsButton';

  _unsub: () => void;

  state = { isUnreadView: this._isUnreadView() };

  componentDidMount() {
    this._unsub = FocusedPerspectiveStore.listen(() =>
      this.setState({ isUnreadView: this._isUnreadView() })
    );
  }

  componentWillUnmount() {
    this._unsub();
  }

  _isUnreadView() {
    const perspective = FocusedPerspectiveStore.current();
    return !!(perspective && (perspective as { unread?: boolean }).unread);
  }

  _onClick = () => {
    const buttonRect = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    Actions.openPopover(<UnreadViewOptionsPopover />, {
      originRect: buttonRect,
      direction: 'down',
    });
  };

  render() {
    if (!this.state.isUnreadView) {
      return false;
    }
    return (
      <button
        tabIndex={-1}
        className="btn btn-toolbar unread-view-options-button"
        title={localized('Unread view options')}
        aria-label={localized('Unread view options')}
        onClick={this._onClick}
      >
        <SVGIcons.Gear size={16} />
      </button>
    );
  }
}
