import React from 'react';
import { Moment } from 'moment-timezone';
import classnames from 'classnames';
import { EventOccurrence, FocusedEventInfo } from './calendar-data-source';
import { MonthViewEvent } from './month-view-event';
import { localized } from 'mailspring-exports';
import { DragState, HitZone } from './calendar-drag-types';

interface MonthViewDayCellProps {
  day: Moment;
  events: EventOccurrence[];
  isToday: boolean;
  isCurrentMonth: boolean;
  maxVisibleEvents: number;
  focusedEvent: FocusedEventInfo | null;
  selectedEvents: EventOccurrence[];
  onEventClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onEventDoubleClick: (event: EventOccurrence) => void;
  onEventFocused: (event: EventOccurrence) => void;
  onDayClick: (day: Moment) => void;
  dragState: DragState | null;
  onEventDragStart: (
    event: EventOccurrence,
    mouseEvent: React.MouseEvent,
    hitZone: HitZone
  ) => void;
}

export class MonthViewDayCell extends React.Component<MonthViewDayCellProps> {
  static displayName = 'MonthViewDayCell';

  _onDayNumberClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    this.props.onDayClick(this.props.day);
  };

  _isEventSelected(event: EventOccurrence): boolean {
    return this.props.selectedEvents.some((e) => e.id === event.id);
  }

  _sortEvents(events: EventOccurrence[]): EventOccurrence[] {
    // Sort by: all-day events first, then by start time
    return [...events].sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return a.start - b.start;
    });
  }

  render() {
    const {
      day,
      events,
      isToday,
      isCurrentMonth,
      maxVisibleEvents,
      focusedEvent,
      onEventClick,
      onEventDoubleClick,
      onEventFocused,
      dragState,
      onEventDragStart,
    } = this.props;

    const sortedEvents = this._sortEvents(events);
    const visibleEvents = sortedEvents.slice(0, maxVisibleEvents);
    const overflowCount = Math.max(0, sortedEvents.length - maxVisibleEvents);

    const cellClassName = classnames('month-view-day-cell', {
      'is-today': isToday,
      'is-other-month': !isCurrentMonth,
    });

    return (
      <div className={cellClassName}>
        <div className="month-view-day-header">
          <span
            className={classnames('month-view-day-number', { 'is-today': isToday })}
            onClick={this._onDayNumberClick}
          >
            {day.date()}
          </span>
        </div>
        <div className="month-view-day-events">
          {visibleEvents.map((event) => (
            <MonthViewEvent
              key={event.id}
              event={event}
              selected={this._isEventSelected(event)}
              focused={focusedEvent?.id === event.id}
              onClick={onEventClick}
              onDoubleClick={onEventDoubleClick}
              onFocused={onEventFocused}
              isDragging={dragState?.event.id === event.id}
              onDragStart={onEventDragStart}
            />
          ))}
          {overflowCount > 0 && (
            <div className="month-view-overflow" onClick={this._onDayNumberClick}>
              {localized('+%@ more', overflowCount)}
            </div>
          )}
        </div>
      </div>
    );
  }
}
