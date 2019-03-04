import React from 'react';
import PropTypes from 'prop-types';

type DisclosureTriangleProps = {
  collapsed?: boolean;
  visible?: boolean;
  onCollapseToggled?: (...args: any[]) => any;
};

export class DisclosureTriangle extends React.Component<DisclosureTriangleProps> {
  static displayName = 'DisclosureTriangle';

  static defaultProps = { onCollapseToggled() {} };

  render() {
    let classnames = 'disclosure-triangle';
    if (this.props.visible) {
      classnames += ' visible';
    }
    if (this.props.collapsed) {
      classnames += ' collapsed';
    }
    return (
      <div className={classnames} onClick={this.props.onCollapseToggled}>
        <div />
      </div>
    );
  }
}
