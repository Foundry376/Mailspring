import React from 'react';
import { localized, PropTypes, DateUtils } from 'mailspring-exports';
import { Flexbox } from 'mailspring-component-kit';
import { pluckByEmail } from '../../activity/lib/activity-event-store';

class OpenTrackingMessagePopover extends React.Component {
  static displayName = 'OpenTrackingMessagePopover';

  static propTypes = {
    message: PropTypes.object,
    openMetadata: PropTypes.object,
  };

  renderOpenActions() {
    const opens = this.props.openMetadata.open_data;
    return opens.map(open => {
      const recipients = this.props.message.to.concat(
        this.props.message.cc,
        this.props.message.bcc
      );
      const recipient = pluckByEmail(recipients, open.recipient);
      const date = new Date(0);
      date.setUTCSeconds(open.timestamp);
      return (
        <Flexbox key={`${open.timestamp}`} className="open-action">
          <div className="recipient">
            {recipient ? recipient.displayName() : localized('Someone')}
          </div>
          <div className="spacer" />
          <div className="timestamp">{DateUtils.shortTimeString(date)}</div>
        </Flexbox>
      );
    });
  }

  render() {
    return (
      <div className="open-tracking-message-popover" tabIndex={-1}>
        <div className="open-tracking-header">{localized('Opened by')}:</div>
        <div className="open-history-container">{this.renderOpenActions()}</div>
      </div>
    );
  }
}

export default OpenTrackingMessagePopover;
