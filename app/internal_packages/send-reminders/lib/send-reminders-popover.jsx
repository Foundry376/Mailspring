import React from 'react';
import moment from 'moment';
import PropTypes from 'prop-types';
import { DateUtils } from 'mailspring-exports';
import { DatePickerPopover } from 'mailspring-component-kit';

const SendRemindersOptions = {
  'In 3 hours': () => DateUtils.minutesFromNow(180),
  'Tomorrow morning': DateUtils.tomorrow,
  'Tomorrow evening': DateUtils.tomorrowEvening,
  'In 3 days': () => DateUtils.hoursFromNow(72),
  'In 1 week': () => DateUtils.weeksFromNow(1),
  'In 2 weeks': () => DateUtils.weeksFromNow(2),
  'In a month': () => DateUtils.monthsFromNow(1),
};

function SendRemindersPopover(props) {
  const { reminderDate, onRemind, onCancelReminder } = props;
  const header = <span key="reminders-header">Remind me if no one replies:</span>;
  const footer = [];

  if (reminderDate) {
    footer.push(<div key="reminders-divider" className="divider" />);
    footer.push(
      <div key="send-reminders-footer" className="section send-reminders-footer">
        <div className="reminders-label">
          <span>
            This thread will come back to the top of your inbox if nobody replies by:
            <span className="reminder-date">
              {` ${moment(reminderDate).format(DateUtils.DATE_FORMAT_LONG_NO_YEAR)}`}
            </span>
          </span>
        </div>
        <button className="btn btn-cancel" onClick={onCancelReminder}>
          Clear reminder
        </button>
      </div>
    );
  }

  return (
    <DatePickerPopover
      className="send-reminders-popover"
      header={header}
      footer={footer}
      onSelectDate={onRemind}
      dateOptions={SendRemindersOptions}
    />
  );
}
SendRemindersPopover.displayName = 'SendRemindersPopover';

SendRemindersPopover.propTypes = {
  reminderDate: PropTypes.instanceOf(Date),
  onRemind: PropTypes.func,
  onCancelReminder: PropTypes.func,
};

export default SendRemindersPopover;
