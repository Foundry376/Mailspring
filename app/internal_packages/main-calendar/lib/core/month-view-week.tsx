import React from 'react';
import moment, { Moment } from 'moment-timezone';
import { localized } from 'mailspring-exports';
import { EventOccurrence, isEventSelected } from './calendar-data-source';
import { EventRendererProps } from './mailspring-calendar';
import { DragState, HitZone } from './calendar-drag-types';
import { MonthViewDayCell } from './month-view-day-cell';
import { MonthViewEvent } from './month-view-event';
import { MonthViewBar, WeekBarsLayout, dayBoundsUnix } from './month-view-helpers';

interface MonthViewWeekProps extends EventRendererProps {
  days: Moment[];
  layout: WeekBarsLayout;
  firstBarIds: Set<string>;
  currentMonth: number;
  maxVisibleEvents: number;
  onDayClick: (day: Moment) => void;
  dragState: DragState | null;
  onEventDragStart: (
    event: EventOccurrence,
    mouseEvent: React.MouseEvent,
    hitZone: HitZone
  ) => void;
  readOnlyCalendarIds: Set<string>;
}

export class MonthViewWeek extends React.Component<MonthViewWeekProps> {
  static displayName = 'MonthViewWeek';

  _renderBar(bar: MonthViewBar) {
    const { event } = bar;
    const { days } = this.props;
    const { start, end } = dayBoundsUnix(days[bar.firstColumn], days[bar.lastColumn]);
    const style = {
      gridColumn: `${bar.firstColumn + 1} / span ${bar.lastColumn - bar.firstColumn + 1}`,
      gridRow: bar.lane + 1,
    };
    return (
      <div
        key={event.id}
        className="month-view-bar"
        style={style}
        data-calendar-start={start}
        data-calendar-end={end}
        data-calendar-type="month-cell"
      >
        <MonthViewEvent
          event={event}
          selected={isEventSelected(this.props.selectedEvents, event)}
          focused={this.props.focusedEvent?.id === event.id}
          continuesBefore={bar.continuesBefore}
          continuesAfter={bar.continuesAfter}
          isFirstBar={this.props.firstBarIds.has(event.id)}
          onClick={this.props.onEventClick}
          onDoubleClick={this.props.onEventDoubleClick}
          onContextMenu={this.props.onEventContextMenu}
          onFocused={this.props.onEventFocused}
          isDragging={this.props.dragState?.event.id === event.id}
          onDragStart={this.props.onEventDragStart}
          isCalendarReadOnly={this.props.readOnlyCalendarIds.has(event.calendarId)}
        />
      </div>
    );
  }

  _renderOverflow(day: Moment, column: number, hiddenCount: number) {
    const { start, end } = dayBoundsUnix(day);
    return (
      <div
        key={`overflow-${column}`}
        className="month-view-overflow"
        style={{ gridColumn: column + 1, gridRow: this.props.maxVisibleEvents }}
        data-calendar-start={start}
        data-calendar-end={end}
        data-calendar-type="month-cell"
        onClick={(e) => {
          e.stopPropagation();
          this.props.onDayClick(day);
        }}
      >
        {localized('+%@ more', hiddenCount)}
      </div>
    );
  }

  render() {
    const { days, layout, currentMonth, onDayClick } = this.props;
    const { bars, hiddenCountByDay } = layout;
    const now = moment();

    return (
      <div className="month-view-week">
        {days.map((day, idx) => (
          <MonthViewDayCell
            key={idx}
            day={day}
            isToday={day.isSame(now, 'day')}
            isCurrentMonth={day.month() === currentMonth}
            onDayClick={onDayClick}
          />
        ))}
        <div className="month-view-week-bars">
          {bars.map((bar) => this._renderBar(bar))}
          {days.map(
            (day, idx) =>
              hiddenCountByDay[idx] > 0 && this._renderOverflow(day, idx, hiddenCountByDay[idx])
          )}
        </div>
      </div>
    );
  }
}
