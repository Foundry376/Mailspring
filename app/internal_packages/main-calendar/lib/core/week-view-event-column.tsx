import React from 'react';
import moment, { Moment } from 'moment';
import classnames from 'classnames';
import { Utils, Event } from 'mailspring-exports';
import { CalendarEvent } from './calendar-event';
import { EventOccurrence } from './calendar-data-source';
import { overlapForEvents } from './week-view-helpers';

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
  focusedEvent: EventOccurrence;
  onEventClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onEventDoubleClick: (event: EventOccurrence) => void;
  onEventFocused: (event: EventOccurrence) => void;
  selectedEvents: EventOccurrence[];
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
    } = this.props;

    const className = classnames({
      'event-column': true,
      weekend: day.day() === 0 || day.day() === 6,
    });
    const overlap = overlapForEvents(events);
    const end = moment(day)
      .add(1, 'day')
      .subtract(1, 'millisecond')
      .valueOf();

    return (
      <div className={className} key={day.valueOf()} data-start={day.valueOf()} data-end={end}>
        {events.map(e => (
          <CalendarEvent
            ref={`event-${e.id}`}
            event={e}
            selected={selectedEvents.includes(e)}
            order={overlap[e.id].order}
            focused={focusedEvent ? focusedEvent.id === e.id : false}
            key={e.id}
            scopeEnd={dayEnd}
            scopeStart={day.unix()}
            concurrentEvents={overlap[e.id].concurrentEvents}
            onClick={onEventClick}
            onDoubleClick={onEventDoubleClick}
            onFocused={onEventFocused}
          />
        ))}
      </div>
    );
  }
}
