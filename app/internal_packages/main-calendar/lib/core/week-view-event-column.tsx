import React from 'react';
import moment, { Moment } from 'moment';
import classnames from 'classnames';
import { Utils } from 'mailspring-exports';
import { CalendarEvent } from './calendar-event';
import { CalendarEventDragPreview } from './calendar-event-drag-preview';
import { EventOccurrence, FocusedEventInfo } from './calendar-data-source';
import { overlapForEvents } from './week-view-helpers';
import { DragState, HitZone } from './calendar-drag-types';

/*
 * This display a single column of events in the Week View.
 * Putting it in its own component dramatically improves render
 * performance since we can run `shouldComponentUpdate` on a
 * column-by-column basis.
 */
interface WeekViewEventColumnProps {
  events: EventOccurrence[];
  day: Moment;
  dayEnd: number;
  focusedEvent: FocusedEventInfo | null;
  onEventClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onEventDoubleClick: (event: EventOccurrence) => void;
  onEventFocused: (event: EventOccurrence) => void;
  selectedEvents: EventOccurrence[];
  dragState: DragState | null;
  onEventDragStart: (
    event: EventOccurrence,
    mouseEvent: React.MouseEvent,
    hitZone: HitZone
  ) => void;
  /** Set of calendar IDs that are read-only */
  readOnlyCalendarIds: Set<string>;
}

export class WeekViewEventColumn extends React.Component<WeekViewEventColumnProps> {
  static displayName = 'WeekViewEventColumn';

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  /**
   * Check if the drag preview should be rendered in this column.
   * The preview is rendered in the column where the preview start time falls.
   * All-day events are NOT rendered here - they're handled by WeekViewAllDayEvents.
   */
  _shouldRenderDragPreview(): boolean {
    const { dragState, day } = this.props;
    if (!dragState || !dragState.isDragging) {
      return false;
    }

    // All-day events are rendered in the all-day section, not in the time columns
    if (dragState.event.isAllDay) {
      return false;
    }

    // Check if the preview start time falls within this day's range
    const dayStart = day.unix();
    const dayEnd = dayStart + 86400; // 24 hours in seconds
    return dragState.previewStart >= dayStart && dragState.previewStart < dayEnd;
  }

  render() {
    const {
      events,
      focusedEvent,
      selectedEvents,
      dayEnd,
      day,
      onEventClick,
      onEventDoubleClick,
      onEventFocused,
      dragState,
      onEventDragStart,
      readOnlyCalendarIds,
    } = this.props;

    const className = classnames({
      'event-column': true,
      weekend: day.day() === 0 || day.day() === 6,
    });
    const overlap = overlapForEvents(events);
    const end = moment(day).add(1, 'day').subtract(1, 'millisecond').valueOf();
    const dayStart = day.unix();
    const dayEndUnix = dayStart + 86400; // 24 hours in seconds

    return (
      <div className={className} key={day.valueOf()} data-start={day.valueOf()} data-end={end}>
        {events.map((e) => (
          <CalendarEvent
            ref={`event-${e.id}`}
            event={e}
            selected={selectedEvents.includes(e)}
            order={overlap[e.id].order}
            focused={focusedEvent ? focusedEvent.id === e.id : false}
            key={e.id}
            scopeEnd={dayEnd}
            scopeStart={dayStart}
            concurrentEvents={overlap[e.id].concurrentEvents}
            onClick={onEventClick}
            onDoubleClick={onEventDoubleClick}
            onFocused={onEventFocused}
            isDragging={dragState?.event.id === e.id}
            onDragStart={onEventDragStart}
            isCalendarReadOnly={readOnlyCalendarIds.has(e.calendarId)}
          />
        ))}
        {this._shouldRenderDragPreview() && (
          <CalendarEventDragPreview
            dragState={dragState!}
            direction="vertical"
            scopeStart={dayStart}
            scopeEnd={dayEndUnix}
          />
        )}
      </div>
    );
  }
}
