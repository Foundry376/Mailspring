import React from 'react';
import moment from 'moment';
import PropTypes from 'prop-types';
import { localized, DateUtils } from 'mailspring-exports';
import { DatePickerPopover } from 'mailspring-component-kit';

const SendRemindersOptions = {
  [localized('In 3 Hours')]: () => DateUtils.minutesFromNow(180),
  [localized('Tomorrow Morning')]: DateUtils.tomorrow,
  [localized('Tomorrow Evening')]: DateUtils.tomorrowEvening,
  [localized('In 3 Days')]: () => DateUtils.hoursFromNow(72),
  [localized('In 1 Week')]: () => DateUtils.weeksFromNow(1),
  [localized('In 2 Weeks')]: () => DateUtils.weeksFromNow(2),
  [localized('In a Month')]: () => DateUtils.monthsFromNow(1),
};

function SendRemindersPopover(props) {
  const { reminderDate, onRemind, onCancelReminder } = props;
  const header = <span key="reminders-header">{localized('Remind me if no one replies')}:</span>;
  const footer = [];

  if (reminderDate) {
    footer.push(<div key="reminders-divider" className="divider" />);
    footer.push(
      <div key="send-reminders-footer" className="section send-reminders-footer">
        <div className="reminders-label">
          <span>
            {localized('This thread will come back to the top of your inbox if nobody replies by:')}
            <span className="reminder-date">
              {` ${moment(reminderDate).format(DateUtils.DATE_FORMAT_LONG_NO_YEAR)}`}
            </span>
          </span>
        </div>
        <button className="btn btn-cancel" onClick={onCancelReminder}>
          {localized('Clear reminder')}
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
