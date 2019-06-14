import _ from 'underscore';
import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import { RetinaImg } from './retina-img';
import {
  localized,
  MailboxPerspective,
  FolderSyncProgressStore,
  FocusedPerspectiveStore,
} from 'mailspring-exports';
import { SyncingListState } from 'mailspring-component-kit';

const INBOX_ZERO_ANIMATIONS = ['gem', 'oasis', 'tron', 'airstrip', 'galaxy'];

type EmptyPerspectiveStateProps = {
  perspective?: MailboxPerspective;
  messageContent?: React.ReactNode;
};

class EmptyPerspectiveState extends React.Component<EmptyPerspectiveStateProps> {
  static displayName = 'EmptyPerspectiveState';

  static propTypes = {
    perspective: PropTypes.object,
    messageContent: PropTypes.node,
  };

  render() {
    const { messageContent, perspective } = this.props;
    let name = perspective.categoriesSharedRole();
    if (perspective.isArchive()) {
      name = 'archive';
    }
    if (!name) {
      ({ name } = perspective);
    }
    if (name) {
      name = name.toLowerCase();
    }

    return (
      <div className="perspective-empty-state">
        {name && (
          <RetinaImg name={`ic-emptystate-${name}.png`} mode={RetinaImg.Mode.ContentIsMask} />
        )}
        <div className="message">{messageContent}</div>
      </div>
    );
  }
}

class EmptyInboxState extends React.Component<{}, { width: number; height: number }> {
  static displayName = 'EmptyInboxState';

  static propTypes = { containerRect: PropTypes.object };

  _containerSizeObserver: ResizeObserver;
  _containerEl: HTMLDivElement;

  state = {
    width: 0,
    height: 0,
  };

  componentDidMount() {
    this._containerSizeObserver = new window.ResizeObserver(entries =>
      window.requestAnimationFrame(() =>
        this.setState({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.width,
        })
      )
    );
    this._containerSizeObserver.observe(this._containerEl);
  }

  componentWillUnmount() {
    this._containerSizeObserver.disconnect();
  }

  _getScalingFactor = () => {
    const { width } = this.state;
    if (!width) {
      return null;
    }
    if (width > 600) {
      return null;
    }
    return (width + 100) / 1000;
  };

  _getAnimationName = (now?: Date) => {
    if (now == null) {
      now = new Date();
    }
    const msInADay = 8.64e7;
    const msSinceEpoch = now.getTime() - now.getTimezoneOffset() * 1000 * 60;
    const daysSinceEpoch = Math.floor(msSinceEpoch / msInADay);
    const idx = daysSinceEpoch % INBOX_ZERO_ANIMATIONS.length;
    return INBOX_ZERO_ANIMATIONS[idx];
  };

  render() {
    const animationName = this._getAnimationName();
    const factor = this._getScalingFactor();
    const style = factor ? { transform: `scale(${factor})` } : {};

    return (
      <div className="inbox-zero-animation" ref={el => (this._containerEl = el)}>
        <div className="animation-wrapper" style={style}>
          <iframe
            title="animation"
            src={`animations/inbox-zero/${animationName}/${animationName}.html`}
          />
          <div className="message">{localized('Hooray! You’re done.')}</div>
        </div>
      </div>
    );
  }
}

class EmptyListState extends React.Component<
  { visible: boolean },
  { active: boolean; syncing: boolean }
> {
  static displayName = 'EmptyListState';
  static propTypes = { visible: PropTypes.bool.isRequired };

  _mounted: boolean = false;
  _unlisteners = [];

  constructor(props) {
    super(props);
    this.state = Object.assign(
      {
        active: false,
      },
      this._getStateFromStores()
    );
  }

  componentDidMount() {
    this._mounted = true;
    this._unlisteners.push(
      FolderSyncProgressStore.listen(() => this.setState(this._getStateFromStores()), this)
    );
    this._unlisteners.push(
      FocusedPerspectiveStore.listen(() => this.setState(this._getStateFromStores()), this)
    );
    if (this.props.visible && !this.state.active) {
      this.setState({ active: true });
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (nextProps.visible !== this.props.visible) {
      return true;
    }
    return !_.isEqual(nextState, this.state);
  }

  componentWillUnmount() {
    this._mounted = false;
    for (let unlisten of Array.from(this._unlisteners)) {
      unlisten();
    }
  }

  componentDidUpdate() {
    if (this.props.visible && !this.state.active) {
      this.setState({ active: true });
    }
  }

  componentWillReceiveProps(newProps) {
    if (newProps.visible === false) {
      this.setState({ active: false });
    }
  }

  render() {
    if (!this.props.visible) {
      return <span />;
    }
    let ContentComponent: React.ComponentType<any> = EmptyPerspectiveState;
    const current = FocusedPerspectiveStore.current();

    let messageContent = current.emptyMessage();
    if (this.state.syncing) {
      messageContent = <SyncingListState empty />;
    } else if (current.isInbox()) {
      ContentComponent = EmptyInboxState;
    }

    const classes = classNames({
      'empty-state': true,
      active: this.state.active,
    });

    return (
      <div className={classes}>
        <ContentComponent perspective={current} messageContent={messageContent} />
      </div>
    );
  }

  _getStateFromStores() {
    return { syncing: FocusedPerspectiveStore.current().hasSyncingCategories() };
  }
}

export default EmptyListState;
