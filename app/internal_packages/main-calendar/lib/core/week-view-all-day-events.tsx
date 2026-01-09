import React from 'react';
import { Utils } from 'mailspring-exports';
import { CalendarEvent } from './calendar-event';
import { EventOccurrence } from './calendar-data-source';
import { OverlapByEventId } from './week-view-helpers';
import { EventRendererProps } from './mailspring-calendar';
import { DragState, HitZone } from './calendar-drag-types';

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

export class WeekViewAllDayEvents extends React.Component<WeekViewAllDayEventsProps> {
  static displayName = 'WeekViewAllDayEvents';

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  render() {
    const {
      height,
      allDayEvents,
      allDayOverlap,
      selectedEvents,
      focusedEvent,
      dragState,
      onEventDragStart,
      readOnlyCalendarIds,
    } = this.props;

    return (
      <div
        className="all-day-events"
        style={{ height: height }}
        data-calendar-start={this.props.start}
        data-calendar-end={this.props.end}
        data-calendar-type="all-day-area"
      >
        {allDayEvents.map(e => (
          <CalendarEvent
            event={e}
            order={allDayOverlap[e.id]?.order || 1}
            key={e.id}
            selected={selectedEvents.includes(e)}
            focused={focusedEvent ? focusedEvent.id === e.id : false}
            scopeStart={this.props.start}
            scopeEnd={this.props.end}
            direction="horizontal"
            fixedSize={this.props.minorDim}
            concurrentEvents={allDayOverlap[e.id]?.concurrentEvents || 1}
            onClick={this.props.onEventClick}
            onDoubleClick={this.props.onEventDoubleClick}
            onFocused={this.props.onEventFocused}
            isDragging={dragState?.event.id === e.id}
            onDragStart={onEventDragStart}
            isCalendarReadOnly={readOnlyCalendarIds.has(e.calendarId)}
          />
        ))}
      </div>
    );
  }
}
