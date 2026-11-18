import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { localized, Actions, Message, DraftEditingSession } from 'mailspring-exports';
import { RetinaImg, LoadingSpinner } from 'mailspring-component-kit';
import moment from 'moment';

import SendRemindersPopover from './send-reminders-popover';
import { reminderDateFor, updateDraftReminderMetadata } from './send-reminders-utils';

interface SendRemindersComposerButtonProps {
  draft: Message;
  session: DraftEditingSession;
}
interface SendRemindersComposerButtonState {
  saving: boolean;
}

export default class SendRemindersComposerButton extends Component<
  SendRemindersComposerButtonProps,
  SendRemindersComposerButtonState
> {
  static displayName = 'SendRemindersComposerButton';

  static containerRequired = false;

  constructor(props) {
    super(props);
    this.state = {
      saving: false,
    };
  }

  shouldComponentUpdate(
    nextProps: SendRemindersComposerButtonProps,
    nextState: SendRemindersComposerButtonState
  ) {
    return (
      nextState.saving !== this.state.saving ||
      reminderDateFor(nextProps.draft) !== reminderDateFor(this.props.draft)
    );
  }

  // Saving ends when the update returns rather than when the draft's reminder date changes,
  // because choosing the current date or declining the upgrade prompt leaves the date as it is.
  onSetReminder = async (reminderDate: Date | null) => {
    const { draft, session } = this.props;
    this.setState({ saving: true });
    Actions.closePopover();

    try {
      await updateDraftReminderMetadata(session, {
        expiration: reminderDate,
        sentHeaderMessageId: draft.headerMessageId,
      });
    } finally {
      this.setState({ saving: false });
    }
  };

  onClick = () => {
    const { draft } = this.props;
    const buttonRect = (ReactDOM.findDOMNode(this) as HTMLElement).getBoundingClientRect();
    Actions.openPopover(
      <SendRemindersPopover
        reminderDate={reminderDateFor(draft)}
        onRemind={(date) => this.onSetReminder(date)}
        onCancelReminder={() => this.onSetReminder(null)}
      />,
      { originRect: buttonRect, direction: 'up' }
    );
  };

  render() {
    let className = 'btn btn-toolbar btn-send-reminder';

    if (this.state.saving) {
      return (
        <button className={className} title={localized('Saving reminder...')} tabIndex={-1}>
          <LoadingSpinner />
        </button>
      );
    }

    const reminderDate = reminderDateFor(this.props.draft);
    let reminderLabel = localized('Set Reminder');
    if (reminderDate) {
      className += ' btn-enabled';
      reminderLabel = localized(`Reminder set for %@ from now`, moment(reminderDate).fromNow(true));
    }

    return (
      <button tabIndex={-1} className={className} title={reminderLabel} onClick={this.onClick}>
        <RetinaImg name="icon-composer-reminders.png" mode={RetinaImg.Mode.ContentIsMask} />
        <span>&nbsp;</span>
        <RetinaImg name="icon-composer-dropdown.png" mode={RetinaImg.Mode.ContentIsMask} />
      </button>
    );
  }
}
