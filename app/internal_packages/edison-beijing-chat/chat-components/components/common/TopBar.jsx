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
    left: EMPTY_SPAN,
    center: EMPTY_SPAN,
    right: EMPTY_SPAN,
  }

  render() {
    const { left, center, right } = this.props;
    return (
      <div className="topBarContainer">
        <div className="left">
          {left}
        </div>
        <div className="center">
          {center}
        </div>
        <div className="right">
          {right}
        </div>
      </div>
    );
  }
}
