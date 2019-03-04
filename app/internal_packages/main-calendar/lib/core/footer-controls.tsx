import React from 'react';
import { PropTypes, Utils } from 'mailspring-exports';

export default class FooterControls extends React.Component<{
  footerComponents: React.ReactChildren;
}> {
  static displayName = 'FooterControls';

  static defaultProps = {
    footerComponents: false,
  };

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

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
