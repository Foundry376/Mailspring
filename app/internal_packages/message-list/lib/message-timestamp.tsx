import React from 'react';
import { DateUtils } from 'mailspring-exports';

interface MessageTimestampProps {
  date: Date;
  className?: string;
  isDetailed: boolean;
  onClick: () => void;
}
class MessageTimestamp extends React.Component<MessageTimestampProps> {
  static displayName = 'MessageTimestamp';

  shouldComponentUpdate(nextProps) {
    return nextProps.date !== this.props.date || nextProps.isDetailed !== this.props.isDetailed;
  }

  render() {
    let formattedDate = null;
    if (this.props.isDetailed) {
      formattedDate = DateUtils.mediumTimeString(this.props.date);
    } else {
      formattedDate = DateUtils.shortTimeString(this.props.date);
    }
    return (
      <div
        className={this.props.className}
        title={DateUtils.fullTimeString(this.props.date)}
        onClick={this.props.onClick}
      >
        {formattedDate}
      </div>
    );
  }
}

export default MessageTimestamp;
