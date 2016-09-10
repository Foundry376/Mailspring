import React from 'react';
import ReactDOM from 'react-dom';
import Reflux from 'reflux';
import _ from 'underscore';

import {Actions} from 'nylas-exports';
import NylasStore from 'nylas-store';

const TipActions = Reflux.createActions(["mountedTip", "seenTip", "unmountedTip"]);

const TipsBackgroundEl = document.createElement('tutorial-tip-background');
document.body.appendChild(TipsBackgroundEl);


class TipsStore extends NylasStore {
  constructor() {
    super();

    this._tipKeys = [];
    TipActions.mountedTip.listen(this._onMountedTip);
    TipActions.unmountedTip.listen(this._onUnmountedTip);
    TipActions.seenTip.listen(this._onSeenTip);
  }

  isTipVisible(key) {
    const seen = NylasEnv.config.get('core.tutorial.seen') || [];
    return this._tipKeys.find(t => !seen.includes(t)) === key;
  }

  hasSeenTip(key) {
    return (NylasEnv.config.get('core.tutorial.seen') || []).includes(key);
  }

  _onMountedTip = (key) => {
    if (!this._tipKeys.includes(key)) {
      this._tipKeys.push(key);
    }
    this.trigger();
  }

  _onSeenTip = (key) => {
    this._tipKeys = this._tipKeys.filter(t => t !== key);
    NylasEnv.config.pushAtKeyPath('core.tutorial.seen', key);
    this.trigger();
  }

  _onUnmountedTip = (key) => {
    this._tipKeys = this._tipKeys.filter(t => t !== key);
    this.trigger();
  }
}

TipsStore = new TipsStore();

class TipPopoverContents extends React.Component {
  static propTypes = {
    title: React.PropTypes.string,
    tipKey: React.PropTypes.string,
    instructions: React.PropTypes.string,
    onDismissed: React.PropTypes.function,
  }

  componentDidMount() {
    TipsBackgroundEl.classList.add('visible');
  }

  componentWillUnmount() {
    TipsBackgroundEl.classList.remove('visible');
    if (this.props.onDismissed) {
      this.props.onDismissed();
    }
  }

  onDone = () => {
    TipActions.seenTip(this.props.tipKey);
    Actions.closePopover();
  }

  render() {
    return (
      <div style={{width: 250, padding: 20, paddingTop: 0}}>
        <h2>{this.props.title}</h2>
        <p dangerouslySetInnerHTML={{__html: this.props.instructions}} />
        <button className="btn" onClick={this.onDone}>Got it!</button>
      </div>
    );
  }
}

export default function HasTutorialTip(ComposedComponent, TipConfig) {
  const TipKey = ComposedComponent.displayName;

  if (TipsStore.hasSeenTip(TipKey)) {
    return ComposedComponent;
  }

  return class extends ComposedComponent {
    static displayName = ComposedComponent.displayName;

    constructor(props) {
      super(props);
      this.state = {visible: false};
    }

    componentDidMount() {
      TipActions.mountedTip(TipKey);

      this._unlisten = TipsStore.listen(this._onTooltipStateChanged);
      window.addEventListener('resize', this._onRecomputeTooltipPosition);

      // unfortunately, we can't render() a container around ComposedComponent
      // without modifying the DOM tree and messing with things like flexbox.
      // Instead, we leave render() unchanged and attach the bubble and hover
      // listeners to the DOM manually.

      this.tipNode = document.createElement('div');
      this.tipNode.classList.add('tutorial-tip');
      document.body.appendChild(this.tipNode);

      this._el = ReactDOM.findDOMNode(this);
      this._el.addEventListener('mouseover', this._onMouseOver);
      this._onTooltipStateChanged();
    }

    componentDidUpdate() {
      if (this.state.visible) {
        this._onRecomputeTooltipPosition();
      }
    }

    componentWillUnmount() {
      this._unlisten();

      window.removeEventListener('resize', this._onRecomputeTooltipPosition);
      document.body.removeChild(this.tipNode);

      TipActions.unmountedTip(TipKey);
    }

    _onTooltipStateChanged = () => {
      const visible = TipsStore.isTipVisible(TipKey);

      if (this.state.visible !== visible) {
        this.setState({visible});
        if (visible) {
          this.tipNode.classList.add('visible');
          this._onRecomputeTooltipPosition();
        } else {
          this.tipNode.classList.remove('visible');
        }
      }
    }

    _onMouseOver = () => {
      if (!this.state.visible) {
        return;
      }

      this._el.removeEventListener('mouseover', this._onMouseOver);

      const tipRect = this.tipNode.getBoundingClientRect();
      const rect = ReactDOM.findDOMNode(this).getBoundingClientRect();
      const rectCX = rect.left + rect.width / 2;
      const rectCY = rect.top + rect.height / 2;
      TipsBackgroundEl.style.background = `
        -webkit-radial-gradient(
          ${Math.round(rectCX / window.innerWidth * 100)}%
          ${Math.round(rectCY / window.innerHeight * 100)}%,
          circle, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) 3%, rgba(0, 0, 0, 0.2) 5%)
      `;
      Actions.openPopover((
        <TipPopoverContents
          tipKey={TipKey}
          title={TipConfig.title}
          instructions={TipConfig.instructions}
          onDismissed={() => {
            this._el.addEventListener('mouseover', this._onMouseOver);
          }}
        />
      ), {
        originRect: tipRect,
        direction: 'down',
        fallbackDirection: 'up',
      })
    }

    _onRecomputeTooltipPosition = () => {
      let settled = 0;
      let last = {};
      const attempt = () => {
        const {left, top} = this._el.getBoundingClientRect();
        this.tipNode.style.left = `${left + 5}px`;
        this.tipNode.style.top = `${top + 5}px`;

        if (!_.isEqual(last, {left, top})) {
          settled = 0;
          last = {left, top};
        }
        settled += 1;
        if (settled < 5) {
          window.requestAnimationFrame(this._onRecomputeTooltipPosition);
        }
      }
      attempt();
    }
  }
}
