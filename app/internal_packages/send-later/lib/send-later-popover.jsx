import React from 'react';
import PropTypes from 'prop-types';
import { localized, DateUtils } from 'mailspring-exports';
import { DatePickerPopover } from 'mailspring-component-kit';

const SendLaterOptions = {
  [localized('In 1 hour')]: DateUtils.in1Hour,
  [localized('In 2 hours')]: DateUtils.in2Hours,
  [localized('Later Today')]: DateUtils.laterToday,
  [localized('Tomorrow Morning')]: DateUtils.tomorrow,
  [localized('Tomorrow Evening')]: DateUtils.tomorrowEvening,
  [localized('This Weekend')]: DateUtils.thisWeekend,
  [localized('Next Week')]: DateUtils.nextWeek,
};

function SendLaterPopover(props) {
  let footer;
  const { onAssignSendLaterDate, onCancelSendLater, sendLaterDate } = props;
  const header = <span key="send-later-header">{localized('Send Later')}:</span>;
  if (sendLaterDate) {
    footer = [
      <div key="divider-unschedule" className="divider" />,
      <div className="section" key="cancel-section">
        <button className="btn btn-cancel" onClick={onCancelSendLater}>
          {localized('Unschedule Send')}
        </button>
      </div>,
    ];
  }

  return (
    <DatePickerPopover
      className="send-later-popover"
      header={header}
      footer={footer}
      dateOptions={SendLaterOptions}
      onSelectDate={onAssignSendLaterDate}
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
