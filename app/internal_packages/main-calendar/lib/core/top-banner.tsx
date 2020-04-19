import React from 'react';

export class TopBanner extends React.Component<{ bannerComponents: React.ReactNode }> {
  static displayName = 'TopBanner';

  render() {
    if (!this.props.bannerComponents) {
      return false;
    }
    return <div className="top-banner">{this.props.bannerComponents}</div>;
  }
}
