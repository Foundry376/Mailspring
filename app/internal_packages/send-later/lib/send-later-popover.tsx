import React from 'react';
import PropTypes from 'prop-types';
import { localized, Actions } from 'mailspring-exports';
import TimeCardPopover, {
  DEFAULT_TIME_CARD_OPTIONS,
  DEFAULT_TIME_CARD_DATES_FACTORY,
  DEFAULT_TIME_CARD_ICON_NAMES,
} from '../../thread-snooze/lib/time-card-popover';

function SendLaterPopover(props) {
  const { onAssignSendLaterDate, onCancelSendLater, sendLaterDate } = props;
  const onSelectDate = (date, itemLabel) => {
    onAssignSendLaterDate(date.toDate ? date.toDate() : date, itemLabel);
    Actions.closePopover();
  };

  return (
    <TimeCardPopover
      className="send-later-popover"
      options={DEFAULT_TIME_CARD_OPTIONS}
      datesFactory={DEFAULT_TIME_CARD_DATES_FACTORY}
      iconNames={DEFAULT_TIME_CARD_ICON_NAMES}
      onSelectDate={onSelectDate}
      footer={
        sendLaterDate ? (
          <div className="section send-later-footer">
            <button className="btn btn-cancel" onClick={onCancelSendLater}>
              {localized('Unschedule Send')}
            </button>
          </div>
        ) : null
      }
    />
  );
}
SendLaterPopover.displayName = 'SendLaterPopover';
SendLaterPopover.propTypes = {
  sendLaterDate: PropTypes.instanceOf(Date),
  onAssignSendLaterDate: PropTypes.func.isRequired,
  onCancelSendLater: PropTypes.func.isRequired,
};

export default SendLaterPopover;
