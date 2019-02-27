import React from 'react';
import { PropTypes, Utils } from 'mailspring-exports';

class SendingProgressBar extends React.Component {
  static propTypes = { progress: PropTypes.number.isRequired };

  render() {
    const otherProps = Utils.fastOmit(this.props, Object.keys(this.constructor.propTypes));
    if (0 < this.props.progress && this.props.progress < 99) {
      return (
        <div className="sending-progress" {...otherProps}>
          <div className="filled" style={{ width: `${Math.min(100, this.props.progress)}%` }} />
        </div>
      );
    } else {
      return (
        <div className="sending-progress" {...otherProps}>
          <div className="indeterminate" />
        </div>
      );
    }
  }
}
export default SendingProgressBar;
