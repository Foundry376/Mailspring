const _ = require('underscore');
const React = require('react');
const ReactDOM = require('react-dom');
const PropTypes = require('prop-types');
const classNames = require('classnames');
const RetinaImg = require('./retina-img').default;
const { FolderSyncProgressStore, FocusedPerspectiveStore } = require('mailspring-exports');
const { SyncingListState, LottieImg } = require('mailspring-component-kit');

const INBOX_ZERO_ANIMATIONS = ['gem', 'oasis', 'tron', 'airstrip', 'galaxy'];

class EmptyPerspectiveState extends React.Component {
  static displayName = 'EmptyPerspectiveState';

  static propTypes = {
    perspective: PropTypes.object,
    messageContent: PropTypes.node,
  };

  renderImage() {
    if (this.props.perspective.emptyListIcon()) {
      return <LottieImg name={this.props.perspective.emptyListIcon()}
        height={500}
        width={500}
        style={{
          width: 500, height: 500, verticalAlign: 'middle',
          border: 0, zoom: 0.5
        }}
      />;
    } else {
      let name = this.props.perspective.categoriesSharedRole();
      if (this.props.perspective.isArchive()) {
        name = 'archive';
      }
      if (!name) {
        ({ name } = this.props.perspective);
      }
      if (name) {
        name = name.toLowerCase();
      }
      if (!name) {
        name = 'nomail';
      }
      return <RetinaImg name={`ic-emptystate-${name}.png`} fallback={`nomail.png`}
        mode={RetinaImg.Mode.ContentPreserve} />;
    }
  }

  render() {
    const { messageContent } = this.props;
    return (
      <div className="perspective-empty-state">
        {this.renderImage()}
        <div className="message">{messageContent}</div>
      </div>
    );
  }
}

class EmptyInboxState extends React.Component {
  static displayName = 'EmptyInboxState';

  static propTypes = { containerRect: PropTypes.object };

  _getScalingFactor = () => {
    const { width } = this.props.containerRect;
    if (!width) {
      return null;
    }
    if (width > 600) {
      return null;
    }
    return (width + 100) / 1000;
  };

  _getAnimationName = now => {
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
      <div className="inbox-zero-animation">
        <div className="animation-wrapper" style={style}>
          {/* <iframe
            title="animation"
            src={`animations/inbox-zero/${animationName}/${animationName}.html`}
          />
          <div className="message">Hooray! You’re done.</div> */}
          <RetinaImg name={`ic-emptystate-${name}.png`} fallback={`nomail.png`} mode={RetinaImg.Mode.ContentPreserve} />
          <div className="message">Hooray! You’re done.</div>
        </div>
      </div>
    );
  }
}

class EmptyListState extends React.Component {
  static displayName = 'EmptyListState';
  static propTypes = { visible: PropTypes.bool.isRequired };

  constructor(props) {
    super(props);
    this._mounted = false;
    this.state = Object.assign(
      {
        active: false,
        rect: {},
      },
      this._getStateFromStores()
    );
  }

  componentDidMount() {
    this._mounted = true;
    this._unlisteners = [];
    this._unlisteners.push(
      FolderSyncProgressStore.listen(() => this.setState(this._getStateFromStores()), this)
    );
    this._unlisteners.push(
      FocusedPerspectiveStore.listen(() => this.setState(this._getStateFromStores()), this)
    );
    window.addEventListener('resize', this._onResize);
    if (this.props.visible && !this.state.active) {
      const rect = this._getDimensions();
      this.setState({ active: true, rect });
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
    window.removeEventListener('resize', this._onResize);
  }

  componentDidUpdate() {
    if (this.props.visible && !this.state.active) {
      const rect = this._getDimensions();
      this.setState({ active: true, rect });
    }
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    if (newProps.visible === false) {
      this.setState({ active: false });
    }
  }

  render() {
    if (!this.props.visible) {
      return <span />;
    }
    let ContentComponent = EmptyPerspectiveState;
    const current = FocusedPerspectiveStore.current();

    let messageContent = current.emptyMessage();

    // DC-1141: do not display syncing status
    // if (this.state.syncing) {
    //   messageContent = <SyncingListState empty />;
    // } else if (current.isInbox()) {
    //   ContentComponent = EmptyInboxState;
    // }
    if (current.isInbox()) {
      ContentComponent = EmptyInboxState;
    }

    const classes = classNames({
      'empty-state': true,
      active: this.state.active,
    });

    return (
      <div className={classes}>
        <ContentComponent
          perspective={current}
          containerRect={this.state.rect}
          messageContent={messageContent}
        />
      </div>
    );
  }

  _getDimensions() {
    if (!this._mounted) {
      return null;
    }
    const node = ReactDOM.findDOMNode(this);
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  _onResize = () => {
    const rect = this._getDimensions();
    if (rect) {
      this.setState({ rect });
    }
  };

  _getStateFromStores() {
    return { syncing: FocusedPerspectiveStore.current().hasSyncingCategories() };
  }
}

module.exports = EmptyListState;
