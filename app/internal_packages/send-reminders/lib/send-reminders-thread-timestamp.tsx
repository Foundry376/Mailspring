import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { RetinaImg } from 'mailspring-component-kit';
import moment from 'moment';

import { Thread, localized, FocusedPerspectiveStore } from 'mailspring-exports';
import { updateReminderMetadata } from './send-reminders-utils';
import { PLUGIN_ID } from './send-reminders-constants';

interface SendRemindersThreadTimestampProps {
  thread: Thread;
  fallback: typeof React.Component;
}

class SendRemindersThreadTimestamp extends Component<SendRemindersThreadTimestampProps> {
  static displayName = 'SendRemindersThreadTimestamp';

  static propTypes = {
    thread: PropTypes.object,
    fallback: PropTypes.func,
  };

  static containerRequired = false;

  onRemoveReminder(thread) {
    updateReminderMetadata(thread, {});
  }

  render() {
    const Fallback = this.props.fallback;
    const current = FocusedPerspectiveStore.current();

    if (!(current as any).isReminders) {
      return <Fallback {...this.props} />;
    }

    const { expiration } = this.props.thread.metadataForPluginId(PLUGIN_ID);
    if (!expiration) {
      return <Fallback {...this.props} />;
    }

    const mExpiration = moment(expiration);

    return (
      <span
        className="send-reminders-thread-timestamp timestamp"
        title={localized(`Reminder set for %@ from now`, mExpiration.fromNow(true))}
      >
        <RetinaImg name="ic-timestamp-reminder.png" mode={RetinaImg.Mode.ContentIsMask} />
        <span className="date-message">{localized('in %@', mExpiration.fromNow(true))}</span>
      </span>
    );
  }
}

export default SendRemindersThreadTimestamp;
