import React from 'react';

export class FooterControls extends React.PureComponent<{
  footerComponents: React.ReactChildren;
}> {
  static displayName = 'FooterControls';

  static defaultProps = {
    footerComponents: false,
  };

  render() {
    if (!this.props.footerComponents) {
      return false;
    }
    return (
      <div className="footer-controls">
        <div className="spacer" style={{ order: 0, flex: 1 }}>
          &nbsp;
        </div>
        {this.props.footerComponents}
      </div>
    );
  }
}
