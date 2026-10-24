import React from 'react';
import classnames from 'classnames';
import { Moment } from 'moment-timezone';

interface WeekdayHeaderProps {
  day: Moment;
  isToday: boolean;
  showDate?: boolean;
}

export function WeekdayHeader({ day, isToday, showDate }: WeekdayHeaderProps) {
  return (
    <div className={classnames('weekday-header', { 'is-today': isToday })}>
      {day.format('ddd')}
      {showDate && <span className="weekday-header-date">{day.format('D')}</span>}
    </div>
  );
}
