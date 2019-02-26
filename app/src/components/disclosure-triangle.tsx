import React from 'react';
import PropTypes from 'prop-types';

class DisclosureTriangle extends React.Component {
  static displayName = 'DisclosureTriangle';

  static propTypes = {
    collapsed: PropTypes.bool,
    visible: PropTypes.bool,
    onCollapseToggled: PropTypes.func,
  };

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

export default DisclosureTriangle;
