import React from 'react';
import { Moment } from 'moment-timezone';
import classnames from 'classnames';

interface MonthViewDayCellProps {
  day: Moment;
  isToday: boolean;
  isCurrentMonth: boolean;
  onDayClick: (day: Moment) => void;
}

/** One day box of the month grid, and the drop target for its day. Events draw over it in MonthViewWeek. */
export class MonthViewDayCell extends React.Component<MonthViewDayCellProps> {
  static displayName = 'MonthViewDayCell';

  _onDayNumberClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    this.props.onDayClick(this.props.day);
  };

  render() {
    const { day, isToday, isCurrentMonth } = this.props;

    const cellClassName = classnames('month-view-day-cell', {
      'is-today': isToday,
      'is-other-month': !isCurrentMonth,
    });

    return (
      <div
        className={cellClassName}
        data-calendar-start={day.clone().startOf('day').unix()}
        data-calendar-end={day.clone().endOf('day').unix()}
        data-calendar-type="month-cell"
      >
        <div className="month-view-day-header">
          <span
            className={classnames('month-view-day-number', { 'is-today': isToday })}
            onClick={this._onDayNumberClick}
          >
            {day.date()}
          </span>
        </div>
      </div>
    );
  }
}
