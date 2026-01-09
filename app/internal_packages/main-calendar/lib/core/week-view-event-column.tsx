import React from 'react';
import { Moment } from 'moment';
import classnames from 'classnames';
import { Utils } from 'mailspring-exports';
import { CalendarEvent } from './calendar-event';
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
    hitZone: HitZone,
    mouseTime: number
  ) => void;
  /** Set of calendar IDs that are read-only */
  readOnlyCalendarIds: Set<string>;
}

export class WeekViewEventColumn extends React.Component<WeekViewEventColumnProps> {
  static displayName = 'WeekViewEventColumn';

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
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
    const dayStart = day.unix();
    const dayEndUnix = dayStart + 86400; // 24 hours in seconds

    return (
      <div
        className={className}
        key={day.valueOf()}
        data-calendar-start={dayStart}
        data-calendar-end={dayEndUnix}
        data-calendar-type="day-column"
      >
        {events.map(e => (
          <CalendarEvent
            event={e}
            selected={selectedEvents.includes(e)}
            order={overlap[e.id]?.order || 1}
            focused={focusedEvent ? focusedEvent.id === e.id : false}
            key={e.id}
            scopeEnd={dayEnd}
            scopeStart={dayStart}
            concurrentEvents={overlap[e.id]?.concurrentEvents || 1}
            onClick={onEventClick}
            onDoubleClick={onEventDoubleClick}
            onFocused={onEventFocused}
            isDragging={dragState?.event.id === e.id}
            onDragStart={onEventDragStart}
            isCalendarReadOnly={readOnlyCalendarIds.has(e.calendarId)}
          />
        ))}
      </div>
    );
  }
}
