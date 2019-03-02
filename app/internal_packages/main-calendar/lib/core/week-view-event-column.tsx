import React from 'react';
import moment, { Moment } from 'moment';
import classnames from 'classnames';
import { PropTypes, Utils, Event } from 'mailspring-exports';
import CalendarEvent from './calendar-event';

/*
 * This display a single column of events in the Week View.
 * Putting it in its own component dramatically improves render
 * performance since we can run `shouldComponentUpdate` on a
 * column-by-column basis.
 */
interface WeekViewEventColumnProps {
  events: Event[];
  day: Moment;
  dayEnd: number;
  focusedEvent: Event;
  eventOverlap: any;
  onEventClick: () => void;
  onEventDoubleClick: () => void;
  onEventFocused: () => void;
  selectedEvents: Event[];
}

export default class WeekViewEventColumn extends React.Component<WeekViewEventColumnProps> {
  static displayName = 'WeekViewEventColumn';

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  renderEvents() {
    const {
      events,
      focusedEvent,
      selectedEvents,
      eventOverlap,
      dayEnd,
      day,
      onEventClick,
      onEventDoubleClick,
      onEventFocused,
    } = this.props;
    return events.map(e => (
      <CalendarEvent
        ref={`event-${e.id}`}
        event={e}
        selected={selectedEvents.includes(e)}
        order={eventOverlap[e.id].order}
        focused={focusedEvent ? focusedEvent.id === e.id : false}
        key={e.id}
        scopeEnd={dayEnd}
        scopeStart={day.unix()}
        concurrentEvents={eventOverlap[e.id].concurrentEvents}
        onClick={onEventClick}
        onDoubleClick={onEventDoubleClick}
        onFocused={onEventFocused}
      />
    ));
  }

  render() {
    const className = classnames({
      'event-column': true,
      weekend: this.props.day.day() === 0 || this.props.day.day() === 6,
    });
    const end = moment(this.props.day)
      .add(1, 'day')
      .subtract(1, 'millisecond')
      .valueOf();
    return (
      <div
        className={className}
        key={this.props.day.valueOf()}
        data-start={this.props.day.valueOf()}
        data-end={end}
      >
        {this.renderEvents()}
      </div>
    );
  }
}
