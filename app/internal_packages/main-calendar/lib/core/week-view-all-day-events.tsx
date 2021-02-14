import React from 'react';
import { Event, Utils } from 'mailspring-exports';
import { CalendarEvent } from './calendar-event';
import { EventOccurrence } from './calendar-data-source';
import { OverlapByEventId } from './week-view-helpers';
import { EventRendererProps } from './mailspring-calendar';

/*
 * Displays the all day events across the top bar of the week event view.
 *
 * Putting this in its own component dramatically improves performance so
 * we can use `shouldComponentUpdate` to selectively re-render these
 * events.
 */
interface WeekViewAllDayEventsProps extends EventRendererProps {
  end: number;
  start: number;
  height: number;
  minorDim: number;
  allDayEvents: EventOccurrence[];
  allDayOverlap: OverlapByEventId;
}

export class WeekViewAllDayEvents extends React.Component<WeekViewAllDayEventsProps> {
  static displayName = 'WeekViewAllDayEvents';

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  render() {
    const { height, allDayEvents, allDayOverlap, selectedEvents, focusedEvent } = this.props;

    return (
      <div className="all-day-events" style={{ height: height }}>
        {allDayEvents.map(e => (
          <CalendarEvent
            event={e}
            order={allDayOverlap[e.id].order}
            key={e.id}
            selected={selectedEvents.includes(e)}
            focused={focusedEvent ? focusedEvent.id === e.id : false}
            scopeStart={this.props.start}
            scopeEnd={this.props.end}
            direction="horizontal"
            fixedSize={this.props.minorDim}
            concurrentEvents={allDayOverlap[e.id].concurrentEvents}
            onClick={this.props.onEventClick}
            onDoubleClick={this.props.onEventDoubleClick}
            onFocused={this.props.onEventFocused}
          />
        ))}
      </div>
    );
  }
}
