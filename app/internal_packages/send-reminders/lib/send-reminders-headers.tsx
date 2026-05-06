import React from 'react';
import moment from 'moment';
import { RetinaImg } from 'mailspring-component-kit';
import { localized, DateUtils, Thread, Message } from 'mailspring-exports';

import { updateReminderMetadata } from './send-reminders-utils';
import { PLUGIN_ID } from './send-reminders-constants';
import { SendRemindersMetadata } from './types';

export function NotificationExplanationMessageHeader({
  thread,
  message,
}: {
  thread: Thread;
  message: Message;
  messages?: Message[];
}) {
  const { shouldNotify, sentHeaderMessageId } =
    thread.metadataForPluginId(PLUGIN_ID) || ({} as SendRemindersMetadata);

  if (!shouldNotify) {
    return <span />;
  }
  if (message.headerMessageId !== sentHeaderMessageId) {
    return <span />;
  }
  return (
    <div className="send-reminders-header">
      <RetinaImg name="ic-timestamp-reminder.png" mode={RetinaImg.Mode.ContentIsMask} />
      <span
        title={localized('This thread was brought back to the top of your inbox as a reminder')}
      >
        {localized('Reminder')}
      </span>
    </div>
  );
}

NotificationExplanationMessageHeader.displayName = 'NotificationExplanationMessageHeader';
NotificationExplanationMessageHeader.containerRequired = false;

export function ScheduledReminderThreadHeader({
  thread,
}: {
  thread: Thread;
  messages?: Message[];
}) {
  const metadata = thread.metadataForPluginId(PLUGIN_ID) || {};
  if (!metadata.expiration) {
    return <span />;
  }

  const onClearReminder = () => {
    updateReminderMetadata(thread, {});
  };

  return (
    <div className="send-reminders-header">
      <RetinaImg name="ic-timestamp-reminder.png" mode={RetinaImg.Mode.ContentIsMask} />
      <span className="reminder-date">
        {` ${moment(metadata.expiration).format(DateUtils.DATE_FORMAT_LONG_NO_YEAR)}`}
      </span>
      <span className="clear-reminder" onClick={onClearReminder}>
        {localized('Cancel')}
      </span>
    </div>
  );
}
ScheduledReminderThreadHeader.displayName = 'ScheduledReminderThreadHeader';
ScheduledReminderThreadHeader.containerRequired = false;
