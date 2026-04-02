import React from 'react';
import moment from 'moment';
import PropTypes from 'prop-types';
import { localized, DateUtils, Actions } from 'mailspring-exports';
import TimeCardPopover, {
  DEFAULT_TIME_CARD_OPTIONS,
  DEFAULT_TIME_CARD_DATES_FACTORY,
  DEFAULT_TIME_CARD_ICON_NAMES,
} from '../../thread-snooze/lib/time-card-popover';

function SendRemindersPopover(props) {
  const { reminderDate, onRemind, onCancelReminder } = props;
  const onSelectDate = (date, itemLabel) => {
    onRemind(date.toDate ? date.toDate() : date, itemLabel);
    Actions.closePopover();
  };

  return (
    <TimeCardPopover
      className="send-reminders-popover"
      options={DEFAULT_TIME_CARD_OPTIONS}
      datesFactory={DEFAULT_TIME_CARD_DATES_FACTORY}
      iconNames={DEFAULT_TIME_CARD_ICON_NAMES}
      onSelectDate={onSelectDate}
      footer={
        reminderDate ? (
          <div className="section send-reminders-footer">
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
        ) : null
      }
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
