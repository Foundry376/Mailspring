import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';

const EMPTY_SPAN = (<span />);

export default class TopBar extends PureComponent {
  static propTypes = {
    left: PropTypes.node,
    center: PropTypes.node,
    right: PropTypes.node,
  }

  static defaultProps = {
    left: null,
    center: null,
    right: EMPTY_SPAN,
  }

  render() {
    const { left, center, right } = this.props;
    return (
      <div className="top-bar-container">
        {left ? (
          <div className="left">
            {left}
          </div>
        ) : null}
        {center ? (
          <div className="center">
            {center}
          </div>
        ) : null}
        <div className="right">
          {right}
        </div>
      </div>
    );
  }
}
