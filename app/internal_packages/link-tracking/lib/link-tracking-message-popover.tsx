import React from 'react';
import { Message, localized, PropTypes, DateUtils } from 'mailspring-exports';
import { Flexbox } from 'mailspring-component-kit';
import { pluckByEmail } from '../../activity/lib/activity-event-store';
import { LinkTrackingMetadata } from './types';

class LinkTrackingMessagePopover extends React.Component<{
  message: Message;
  openMetadata: LinkTrackingMetadata;
}> {
  static displayName = 'LinkTrackingMessagePopover';

  static propTypes = {
    message: PropTypes.object,
    linkMetadata: PropTypes.object,
  };

  renderClickActions() {
    const clicks = this.props.linkMetadata.click_data;
    return clicks.map(click => {
      const recipients = this.props.message.to.concat(
        this.props.message.cc,
        this.props.message.bcc
      );

      const recipient = pluckByEmail(recipients, click.recipient);
      const date = new Date(0);
      date.setUTCSeconds(click.timestamp);
      return (
        <Flexbox key={`${click.timestamp}`} className="click-action">
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
      <div className="link-tracking-message-popover" tabIndex={-1}>
        <div className="link-tracking-header">{localized('Clicked by:')}</div>
        <div className="click-history-container">{this.renderClickActions()}</div>
      </div>
    );
  }
}

export default LinkTrackingMessagePopover;
