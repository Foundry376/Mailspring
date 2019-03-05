import React from 'react';
import PropTypes from 'prop-types';

export default class TopBanner extends React.Component<{ bannerComponents: React.ReactNode }> {
  static displayName = 'TopBanner';

  static propTypes = {
    bannerComponents: PropTypes.node,
  };

  render() {
    if (!this.props.bannerComponents) {
      return false;
    }
    return <div className="top-banner">{this.props.bannerComponents}</div>;
  }
}
