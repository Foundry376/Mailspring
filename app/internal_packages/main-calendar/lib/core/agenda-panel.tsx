import React from 'react';
import moment from 'moment-timezone';
import { ScrollRegion } from 'mailspring-component-kit';
import { localized, Actions, CalendarDate, CalendarDateUtils, DateUtils } from 'mailspring-exports';
import { MailspringCalendarViewProps } from './mailspring-calendar';
import { CalendarEventPopover } from './calendar-event-popover';
import {
  EventOccurrence,
  EventRangeSubscription,
  eventCoversDate,
  isTimed,
  occurrenceStartUnix,
  isEventSelected,
} from './calendar-data-source';
import { calcEventColors, dateOf, formatShortTimeRange, momentOf } from './calendar-helpers';

const DAYS_IN_PANEL = 14;

export type AgendaPanelProps = Pick<
  MailspringCalendarViewProps,
  'dataSource' | 'disabledCalendars' | 'selectedEvents' | 'onEventClick' | 'isCalendarReadOnly'
> & {
  /** Replaces the event's popover, which the agenda opens itself outside the calendar. */
  onEventDoubleClick?: (event: EventOccurrence) => void;
};

interface DayEvents {
  date: CalendarDate;
  events: EventOccurrence[];
}

interface AgendaPanelState {
  events: EventOccurrence[];
  today: CalendarDate;
}

export class AgendaPanel extends React.Component<AgendaPanelProps, AgendaPanelState> {
  static displayName = 'AgendaPanel';

  _sub: EventRangeSubscription;
  _dayChange?: { dispose(): void };

  constructor(props: AgendaPanelProps) {
    super(props);
    this.state = {
      events: [],
      today: dateOf(moment()),
    };
    this._sub = new EventRangeSubscription(props.dataSource, 0, (events) =>
      this.setState({ events })
    );
  }

  componentDidMount() {
    this._dayChange = CalendarDateUtils.onDayChange(this.state.today, (today) =>
      this.setState({ today })
    );
    this._subscribe();
  }

  componentDidUpdate() {
    this._subscribe();
  }

  componentWillUnmount() {
    this._dayChange?.dispose();
    this._sub.dispose();
  }

  _subscribe() {
    this._sub.cover(this._calculateRange(), this.props.disabledCalendars);
  }

  /** The days shown, from today, `end` exclusive. */
  _calculateRange() {
    const first = this.state.today;
    return { first, end: CalendarDateUtils.addCalendarDays(first, DAYS_IN_PANEL) };
  }

  /** Only the days with something on, as Notion Calendar lists them. */
  _getEventsByDay(): DayEvents[] {
    const { first } = this._calculateRange();
    const days: DayEvents[] = [];

    for (let i = 0; i < DAYS_IN_PANEL; i++) {
      const date = CalendarDateUtils.addCalendarDays(first, i);

      const events = this.state.events
        .filter((event) => eventCoversDate(event, date))
        .sort((a, b) => {
          // All-day events first, then sort by start time
          if (a.isAllDay && !b.isAllDay) return -1;
          if (!a.isAllDay && b.isAllDay) return 1;
          return occurrenceStartUnix(a) - occurrenceStartUnix(b);
        });

      if (events.length > 0) days.push({ date, events });
    }

    return days;
  }

  _renderEventTime(event: EventOccurrence) {
    if (!isTimed(event)) {
      return <div className="agenda-event-time">{localized('All day')}</div>;
    }
    return (
      <div className="agenda-event-time">
        {formatShortTimeRange(event.start, event.end)}{' '}
        <span className="agenda-event-duration">
          {DateUtils.formatDuration(event.end - event.start)}
        </span>
      </div>
    );
  }

  _renderDayHeader(date: CalendarDate) {
    return (
      <div className={`agenda-day-header${date === this.state.today ? ' is-today' : ''}`}>
        {momentOf(date).format('ddd MMM D')}
      </div>
    );
  }

  /**
   * Open the event popover anchored to the actual clicked element, rather than
   * relying on the parent's getElementById lookup which would fail for
   * multi-day events rendered with day-unique DOM ids.
   */
  _onAgendaEventDoubleClick = (e: React.MouseEvent, event: EventOccurrence) => {
    if (this.props.onEventDoubleClick) {
      this.props.onEventDoubleClick(event);
      return;
    }
    const eventEl = e.currentTarget as HTMLElement;
    Actions.openPopover(
      <CalendarEventPopover
        event={event}
        isCalendarReadOnly={this.props.isCalendarReadOnly(event.calendarId)}
      />,
      {
        originRect: eventEl.getBoundingClientRect(),
        direction: 'left',
        fallbackDirection: 'right',
        closeOnAppBlur: false,
      }
    );
  };

  _renderEvent(event: EventOccurrence, dayKey: string) {
    const colors = calcEventColors(event.calendarId);
    const isSelected = isEventSelected(this.props.selectedEvents, event);

    // Use a day-unique id/key so multi-day events don't produce duplicate DOM ids
    const uniqueId = `${event.id}-${dayKey}`;

    const className = [
      'agenda-event',
      isSelected && 'selected',
      event.isCancelled && 'cancelled',
      event.isPending && 'pending',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        id={uniqueId}
        key={uniqueId}
        className={className}
        onClick={(e) => this.props.onEventClick(e, event)}
        onDoubleClick={(e) => this._onAgendaEventDoubleClick(e, event)}
        tabIndex={0}
      >
        <div className="agenda-event-color-bar" style={{ backgroundColor: colors.band }} />
        <div className="agenda-event-details">
          <div className="agenda-event-title">
            {event.isCancelled ? (
              <s>{event.title || localized('(No title)')}</s>
            ) : (
              event.title || localized('(No title)')
            )}
          </div>
          {this._renderEventTime(event)}
        </div>
      </div>
    );
  }

  _renderDay = (dayEvents: DayEvents) => {
    const { date, events } = dayEvents;
    const dayKey = CalendarDateUtils.formatCalendarDate(date);
    return (
      <div className="agenda-day" key={date}>
        {this._renderDayHeader(date)}
        {events.map((event) => this._renderEvent(event, dayKey))}
      </div>
    );
  };

  render() {
    const days = this._getEventsByDay();
    return (
      <aside className="agenda-panel" aria-label={localized('Agenda')}>
        <ScrollRegion className="agenda-scroll-region">
          <div className="agenda-event-list">
            {days.length > 0 ? (
              days.map(this._renderDay)
            ) : (
              <div className="agenda-no-events">{localized('No events')}</div>
            )}
          </div>
        </ScrollRegion>
      </aside>
    );
  }
}
