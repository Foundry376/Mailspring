import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ReactDOM from 'react-dom';
import { localized, Actions, DatabaseStore, Message, Thread } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import SendRemindersPopover from './send-reminders-popover';
import { updateReminderMetadata, reminderDateFor } from './send-reminders-utils';

export default class SendRemindersPopoverButton extends Component<{
  className: string;
  thread: Thread;
  direction: string;
  getBoundingClientRect: (me: SendRemindersPopoverButton) => ClientRect;
}> {
  static displayName = 'SendRemindersPopoverButton';

  static propTypes = {
    className: PropTypes.string,
    thread: PropTypes.object,
    direction: PropTypes.string,
    getBoundingClientRect: PropTypes.func,
  };

  static defaultProps = {
    direction: 'down',
    className: 'btn btn-toolbar',
    getBoundingClientRect: inst =>
      (ReactDOM.findDOMNode(inst) as HTMLElement).getBoundingClientRect(),
  };

  onSetReminder = async expiration => {
    const { thread } = this.props;

    // get the messages on the thread and find the last one received.
    // we need to identify the message which will show the reminder
    DatabaseStore.findAll<Message>(Message, { threadId: thread.id }).then(messages => {
      const lastSent = messages.reverse().find(m => m.isFromMe());
      const metadata = expiration
        ? {
            expiration,
            shouldNotify: false,
            sentHeaderMessageId: lastSent ? lastSent.headerMessageId : null,
            lastReplyTimestamp: new Date(thread.lastMessageReceivedTimestamp).getTime() / 1000,
          }
        : {};

      updateReminderMetadata(thread, metadata);

      Actions.closePopover();
    });
  };

  onClick = event => {
    event.stopPropagation();
    const { direction, thread, getBoundingClientRect } = this.props;
    const reminderDate = reminderDateFor(thread);
    const buttonRect = getBoundingClientRect(this);
    Actions.openPopover(
      <SendRemindersPopover
        reminderDate={reminderDate}
        onRemind={date => this.onSetReminder(date)}
        onCancelReminder={() => this.onSetReminder(null)}
      />,
      { originRect: buttonRect, direction }
    );
  };

  render() {
    const { className, thread } = this.props;
    const reminderDate = reminderDateFor(thread);
    const title = reminderDate ? localized('Edit Reminder') : localized('Set Reminder');
    return (
      <button
        title={title}
        tabIndex={-1}
        className={`send-reminders-toolbar-button ${className}`}
        onClick={this.onClick}
      >
        <RetinaImg name="ic-toolbar-native-reminder.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}
