import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import classNames from 'classnames';

type SpinnerProps = {
  visible?: boolean;
  withCover?: boolean;
  style?: object;
};
type SpinnerState = {
  hidden: boolean;
  paused: boolean;
};

/*
Public: Displays an indeterminate progress indicator in the center of it's
parent component.

Section: Component Kit
*/
export class Spinner extends React.Component<SpinnerProps, SpinnerState> {
  /*
    Public: React `props` supported by Spinner:

     - `visible` (optional) Pass true to display the spinner and false to hide it.
     - `withCover` (optiona) Pass true to dim the content behind the spinner.
     - `style` (optional) Additional styles to apply to the spinner.
    */
  static propTypes = {
    visible: PropTypes.bool,
    withCover: PropTypes.bool,
    style: PropTypes.object,
  };

  timer = null;
  state = {
    hidden: true,
    paused: true,
  };

  componentDidMount() {
    // The spinner always starts hidden. After it's mounted, it unhides itself
    // if it's set to visible. This is a bit strange, but ensures that the CSS
    // transition from .spinner.hidden => .spinner always happens, along with
    // it's associated animation delay.
    if (this.props.visible && this.state.hidden) {
      this.showAfterDelay();
    }
  }

  componentWillUnmount() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  componentWillReceiveProps(nextProps) {
    // If we have a cover, show right away.
    if (nextProps.withCover) {
      this.setState({ hidden: !nextProps.visible });
      return;
    }

    const hidden = nextProps.visible != null ? !nextProps.visible : false;

    if (this.state.hidden === false && hidden === true) {
      this.setState({ hidden: true });
      this.pauseAfterDelay();
    } else if (this.state.hidden === true && hidden === false) {
      this.showAfterDelay();
    }
  }

  pauseAfterDelay = () => {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      if (this.props.visible) {
        return;
      }
      this.setState({ paused: true });
    }, 250);
  };

  showAfterDelay = () => {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      if (this.props.visible !== true) {
        return;
      }
      this.setState({ paused: false, hidden: false });
    }, 300);
  };

  render() {
    if (this.props.withCover) {
      return this._renderDotsWithCover();
    } else {
      return this._renderSpinnerDots();
    }
  }

  // This displays an extra div that's a partially transparent white cover.
  // If you don't want to make your own background for the loading state,
  // this is a convenient default.
  _renderDotsWithCover() {
    const coverClasses = classNames({
      'spinner-cover': true,
      hidden: this.state.hidden,
    });

    const style = Object.assign({}, this.props.style != null ? this.props.style : {}, {
      position: 'absolute',
      display: this.state.hidden ? 'none' : 'block',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(255,255,255,0.9)',
      zIndex: 1000,
    });

    return (
      <div className={coverClasses} style={style}>
        {this._renderSpinnerDots()}
      </div>
    );
  }

  _renderSpinnerDots() {
    const spinnerClass = classNames({
      spinner: true,
      hidden: this.state.hidden,
      paused: this.state.paused,
    });

    const style = _.extend({}, this.props.style != null ? this.props.style : {}, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      zIndex: 1001,
      transform: 'translate(-50%,-50%)',
    });

    const otherProps = _.omit(this.props, Object.keys(Spinner.propTypes));
    return (
      <div className={spinnerClass} {...otherProps} style={style}>
        <div className="bounce1" />
        <div className="bounce2" />
        <div className="bounce3" />
        <div className="bounce4" />
      </div>
    );
  }
}
