import React from 'react';
import _ from 'underscore';
import Actions from 'nylas-exports';

import TutorialUtils from './tutorial-utils';

export default class TutorialOverlay extends React.Component {

  componentWillMount() {
    this.setState({
      style: this.getStyleForTarget(),
    });
  }

  componentDidMount() {
    window.addEventListener("resize", this._onResize);

    let style = this.state.style;
    let stableCount = 0;

    const check = () => {
      // first, check that the target is in the DOM
      const target = TutorialUtils.findElement(this.props.target);
      if (!target) {
        console.log(`Could not find ${this.props.target}`);
        this._settleTimeout = setTimeout(check, 1000);
        return;
      }

      this.target.addEventListener('mouseover', this._onMouseOver);

      // next, wait for it's dimenstions to stabalize for 10 frames
      const nextStyle = this.getStyleForTarget();
      if (!_.isEqual(style, nextStyle)) {
        stableCount = 0;
        style = nextStyle;
      }

      if (stableCount < 10) {
        this._settleTimeout = setTimeout(check, 0);
        stableCount ++;
        return;
      }

      this.setState({style: nextStyle});
    };

    check();
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this._onResize);
    if (this.target) {
      this.target.removeEventListener('mouseover', this._onMouseOver);
    }
    clearTimeout(this._settleTimeout);
  }

  getTarget(callback) {
    const check = () => {
      // first, check that the target is in the DOM
      const target = TutorialUtils.findElement(this.props.target);
      if (!target) {
        console.log(`Could not find ${this.props.target}`);
        this._settleTimeout = setTimeout(check, 1000);
        return;
      }
    }
    check();
  }

  getStyleForTarget() {
    const target = TutorialUtils.findElement(this.props.target);
    if (!target) {
      return null;
    }

    const bounds = target.getBoundingClientRect();
    return {
      top: bounds.top,
      left: bounds.right - 16,
    }
  }

  _onResize = () => {
    this.setState({style: this.getStyleForTarget()});
  }

  _onMouseOver = () => {
    Actions.openPopover(
      <div>
        <h2>{this.props.title}</h2>
        <p>{this.props.instructions}</p>
      </div>
    )
  }

  render() {
    const {style} = this.state;

    if (!style) {
      return <span></span>;
    }

    return (
      <div
        style={style}
        className="tutorial-tip"
      />
    )
  }
}

TutorialOverlay.propTypes = {
  title: React.PropTypes.string,
  instructions: React.PropTypes.string,
  target: React.PropTypes.string,
}
