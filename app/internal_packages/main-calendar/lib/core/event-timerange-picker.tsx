import moment from 'moment';
import React from 'react';
import { DateUtils } from 'mailspring-exports';
import { DatePicker, RetinaImg, TimePicker } from 'mailspring-component-kit';

export const EventTimerangePicker: React.FunctionComponent<{
  start: number;
  end: number;
  onChange: ({ start, end }) => void;
}> = ({ start, end, onChange }) => {
  const onChangeStartTime = newTimestamp => {
    const newStart = moment(newTimestamp);
    let newEnd = moment(end);
    if (newEnd.isSameOrBefore(newStart)) {
      const leftInDay = moment(newStart)
        .endOf('day')
        .diff(newStart);
      const move = Math.min(leftInDay, moment.duration(1, 'hour').asMilliseconds());
      newEnd = moment(newStart).add(move, 'ms');
    }
    onChange({ start: newStart.unix(), end: newEnd.unix() });
  };

  const onChangeEndTime = (newTimestamp: number) => {
    const newEnd = moment(newTimestamp);
    let newStart = moment(start);
    if (newStart.isSameOrAfter(newEnd)) {
      const sinceDay = moment(newEnd).diff(newEnd.startOf('day'));
      const move = Math.min(sinceDay, moment.duration(1, 'hour').asMilliseconds());
      newStart = moment(newEnd).subtract(move, 'ms');
    }
    onChange({ end: newEnd.unix(), start: newStart.unix() });
  };

  const onChangeDay = (newTimestamp: number) => {
    const newDay = moment(newTimestamp);

    const newStart = moment(start);
    newStart.year(newDay.year());
    newStart.dayOfYear(newDay.dayOfYear());

    const newEnd = moment(end);
    newEnd.year(newDay.year());
    newEnd.dayOfYear(newDay.dayOfYear());

    this.setState({ start: newStart.unix(), end: newEnd.unix() });
  };

  return (
    <div className="row time">
      <RetinaImg name="ic-eventcard-time@2x.png" mode={RetinaImg.Mode.ContentPreserve} />
      <span>
        <TimePicker value={start * 1000} onChange={onChangeStartTime} />
        to
        <TimePicker value={end * 1000} onChange={onChangeEndTime} />
        <span className="timezone">
          {moment()
            .tz(DateUtils.timeZone)
            .format('z')}
        </span>
        &nbsp; on &nbsp;
        <DatePicker value={start * 1000} onChange={onChangeDay} />
      </span>
    </div>
  );
};
