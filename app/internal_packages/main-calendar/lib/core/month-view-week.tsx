import React from 'react';
import moment, { Moment } from 'moment-timezone';
import classnames from 'classnames';
import { localized, CalendarDateUtils } from 'mailspring-exports';
import { EventOccurrence, isEventSelected } from './calendar-data-source';
import { EventRendererProps } from './mailspring-calendar';
import { DragState, HitZone } from './calendar-drag-types';
import { MonthViewDayCell } from './month-view-day-cell';
import { MonthViewEvent } from './month-view-event';
import { MonthViewBar, layoutWeekBars } from './month-view-helpers';

interface MonthViewWeekProps extends EventRendererProps {
  days: Moment[];
  /** Every event in view, drag preview included; the row picks out the ones that cover it. */
  events: EventOccurrence[];
  /** The month being viewed (`moment().month()`); days outside it are drawn dimmed. */
  currentMonth: number;
  /** Whether this is the grid's top row, where an event that began before the grid shows first. */
  isFirstWeek: boolean;
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

/**
 * One row of the month grid: the day cells underneath, and every event covering the row drawn
 * over them as one bar on a 7-column grid, so a multi-day event runs across the boxes it covers.
 */
export class MonthViewWeek extends React.Component<MonthViewWeekProps> {
  static displayName = 'MonthViewWeek';

  // Same reading as each cell's own data-calendar-start/end, so a bar and the cells under it
  // hand the drag the same day.
  _barBounds(bar: MonthViewBar) {
    const { days } = this.props;
    return {
      start: days[bar.firstColumn].clone().startOf('day').unix(),
      end: days[bar.lastColumn].clone().endOf('day').unix(),
    };
  }

  _renderBar(bar: MonthViewBar) {
    const { event } = bar;
    const { start, end } = this._barBounds(bar);
    const style = {
      gridColumn: `${bar.firstColumn + 1} / span ${bar.lastColumn - bar.firstColumn + 1}`,
      gridRow: bar.slot + 1,
    };
    return (
      <div
        key={event.id}
        className={classnames('month-view-bar', {
          'continues-before': bar.continuesBefore,
          'continues-after': bar.continuesAfter,
          'drag-preview': event.isDragPreview,
        })}
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
          isFirstBar={!bar.continuesBefore || this.props.isFirstWeek}
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
    return (
      <div
        key={`overflow-${column}`}
        className="month-view-overflow"
        style={{ gridColumn: column + 1, gridRow: this.props.maxVisibleEvents }}
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
    const { days, events, currentMonth, maxVisibleEvents, onDayClick } = this.props;
    const weekDates = days.map((d) => CalendarDateUtils.calendarDateFromUnix(d.unix()));
    const { bars, hiddenCountByDay } = layoutWeekBars(events, weekDates, maxVisibleEvents);
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
