import React from 'react';
import { localized, DateUtils, Message } from 'mailspring-exports';
import { Flexbox } from 'mailspring-component-kit';
import { pluckByEmail, recipientIsUnknowable } from '../../activity/lib/activity-events';
import { OpenTrackingMetadata } from './types';

class OpenTrackingMessagePopover extends React.Component<{
  message: Message;
  openMetadata: OpenTrackingMetadata;
}> {
  static displayName = 'OpenTrackingMessagePopover';

  renderOpenActions() {
    const opens = this.props.openMetadata.open_data;
    return opens.map((open) => {
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
        {recipientIsUnknowable(this.props.message, this.props.openMetadata) && (
          <div className="unattributed-note">
            {localized(
              'This message was sent to everyone at once, so Mailspring cannot tell which recipient opened it.'
            )}
          </div>
        )}
      </div>
    );
  }
}

export default OpenTrackingMessagePopover;
