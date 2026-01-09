import React from 'react';
import moment, { Moment } from 'moment-timezone';
import classnames from 'classnames';
import { EventOccurrence, FocusedEventInfo } from './calendar-data-source';
import { MonthViewEvent } from './month-view-event';
import { localized } from 'mailspring-exports';
import { DragState, HitZone } from './calendar-drag-types';
import { calcColor } from './calendar-helpers';
import { formatDragPreviewTime } from './calendar-drag-utils';

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
  /** Set of calendar IDs that are read-only */
  readOnlyCalendarIds: Set<string>;
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

  /**
   * Check if this day cell should show the drag preview.
   * Returns true if the preview start falls within this day.
   */
  _shouldRenderDragPreview(): boolean {
    const { dragState, day } = this.props;
    if (!dragState || !dragState.isDragging) {
      return false;
    }

    // Check if the preview start falls within this day
    const dayStart = day.clone().startOf('day').unix();
    const dayEnd = day.clone().endOf('day').unix();
    return dragState.previewStart >= dayStart && dragState.previewStart <= dayEnd;
  }

  _renderDragPreview() {
    const { dragState } = this.props;
    if (!dragState) return null;

    const color = calcColor(dragState.event.calendarId);
    const timeString = formatDragPreviewTime(
      dragState.previewStart,
      dragState.previewEnd,
      dragState.event.isAllDay
    );

    return (
      <div
        className="month-view-event month-view-drag-preview"
        style={{
          backgroundColor: color,
          borderColor: color,
          opacity: 0.7,
          border: `2px dashed ${color}`,
        }}
      >
        <span className="month-view-event-title">{dragState.event.title}</span>
        <span className="drag-preview-time-tooltip">{timeString}</span>
      </div>
    );
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
      readOnlyCalendarIds,
    } = this.props;

    const sortedEvents = this._sortEvents(events);
    const visibleEvents = sortedEvents.slice(0, maxVisibleEvents);
    const overflowCount = Math.max(0, sortedEvents.length - maxVisibleEvents);

    const cellClassName = classnames('month-view-day-cell', {
      'is-today': isToday,
      'is-other-month': !isCurrentMonth,
    });

    const dayStartUnix = day.clone().startOf('day').unix();
    const dayEndUnix = day.clone().endOf('day').unix();

    return (
      <div
        className={cellClassName}
        data-calendar-start={dayStartUnix}
        data-calendar-end={dayEndUnix}
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
              isCalendarReadOnly={readOnlyCalendarIds.has(event.calendarId)}
            />
          ))}
          {this._shouldRenderDragPreview() && this._renderDragPreview()}
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
