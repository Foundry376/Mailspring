import React from 'react';
import moment, { Moment } from 'moment-timezone';
import { ScrollRegion, InjectedComponentSet } from 'mailspring-component-kit';
import { localized, Actions } from 'mailspring-exports';
import { MailspringCalendarViewProps } from './mailspring-calendar';
import { CalendarView } from './calendar-constants';
import { HeaderControls } from './header-controls';
import { CalendarEventPopover } from './calendar-event-popover';
import { EventOccurrence } from './calendar-data-source';
import { Disposable } from 'rx-core';
import { calcEventColors, extractMeetingDomain } from './calendar-helpers';

const DAYS_IN_VIEW = 14;

interface DayEvents {
  day: Moment;
  events: EventOccurrence[];
}

interface AgendaViewState {
  events: EventOccurrence[];
}

export class AgendaView extends React.Component<MailspringCalendarViewProps, AgendaViewState> {
  static displayName = 'AgendaView';

  _mounted = false;
  _sub?: Disposable;

  constructor(props: MailspringCalendarViewProps) {
    super(props);
    this.state = {
      events: [],
    };
  }

  componentDidMount() {
    this._mounted = true;
    this.updateSubscription();
  }

  componentDidUpdate(prevProps: MailspringCalendarViewProps) {
    if (
      prevProps.focusedMoment !== this.props.focusedMoment ||
      prevProps.disabledCalendars !== this.props.disabledCalendars
    ) {
      this.updateSubscription();
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    this._sub && this._sub.dispose();
  }

  updateSubscription() {
    const { rangeStart, rangeEnd } = this._calculateRange();

    this._sub && this._sub.dispose();
    this._sub = this.props.dataSource
      .buildObservable({
        disabledCalendars: this.props.disabledCalendars,
        startUnix: rangeStart.unix(),
        endUnix: rangeEnd.unix(),
      })
      .subscribe((state) => {
        if (this._mounted) {
          this.setState(state);
        }
      });
  }

  _calculateRange() {
    const { focusedMoment } = this.props;
    const rangeStart = moment(focusedMoment).startOf('day');
    const rangeEnd = moment(focusedMoment)
      .startOf('day')
      .add(DAYS_IN_VIEW, 'days')
      .subtract(1, 'second');
    return { rangeStart, rangeEnd };
  }

  _getEventsByDay(): DayEvents[] {
    const { focusedMoment } = this.props;
    const days: DayEvents[] = [];

    for (let i = 0; i < DAYS_IN_VIEW; i++) {
      const day = moment(focusedMoment).startOf('day').add(i, 'days');
      const dayStart = day.unix();
      const dayEnd = day.clone().endOf('day').unix();

      const events = this.state.events
        .filter((event) => event.start < dayEnd && event.end > dayStart)
        .sort((a, b) => {
          // All-day events first, then sort by start time
          if (a.isAllDay && !b.isAllDay) return -1;
          if (!a.isAllDay && b.isAllDay) return 1;
          return a.start - b.start;
        });

      days.push({ day, events });
    }

    return days;
  }

  _isToday(day: Moment): boolean {
    return day.isSame(moment(), 'day');
  }

  _onClickToday = () => {
    this.props.onChangeFocusedMoment(moment());
  };

  _onClickNext = () => {
    const newMoment = moment(this.props.focusedMoment).add(DAYS_IN_VIEW, 'days');
    this.props.onChangeFocusedMoment(newMoment);
  };

  _onClickPrev = () => {
    const newMoment = moment(this.props.focusedMoment).subtract(DAYS_IN_VIEW, 'days');
    this.props.onChangeFocusedMoment(newMoment);
  };

  _formatEventTime(event: EventOccurrence): string {
    if (event.isAllDay) {
      return localized('All day');
    }
    const start = moment.unix(event.start);
    const end = moment.unix(event.end);
    return `${start.format('LT')} – ${end.format('LT')}`;
  }

  _renderDayHeader(day: Moment) {
    const isToday = this._isToday(day);
    const className = `agenda-day-header${isToday ? ' is-today' : ''}`;
    return (
      <div className={className}>
        <span className="agenda-day-name">{day.format('dddd')}</span>
        <span className="agenda-day-date">{day.format('MMMM D')}</span>
        {isToday && <span className="agenda-today-badge">{localized('Today')}</span>}
      </div>
    );
  }

  /**
   * Open the event popover anchored to the actual clicked element, rather than
   * relying on the parent's getElementById lookup which would fail for
   * multi-day events rendered with day-unique DOM ids.
   */
  _onAgendaEventDoubleClick = (e: React.MouseEvent, event: EventOccurrence) => {
    const eventEl = e.currentTarget as HTMLElement;
    Actions.openPopover(<CalendarEventPopover event={event} />, {
      originRect: eventEl.getBoundingClientRect(),
      direction: 'right',
      fallbackDirection: 'left',
      closeOnAppBlur: false,
    });
  };

  _renderEvent(event: EventOccurrence, dayKey: string) {
    const colors = calcEventColors(event.calendarId);
    const meetingDomain = extractMeetingDomain(event.location, event.description);
    const isSelected = this.props.selectedEvents.some((e) => e.id === event.id);

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
        <div className="agenda-event-time">{this._formatEventTime(event)}</div>
        <div className="agenda-event-details">
          <div
            className="agenda-event-title"
            style={isSelected ? undefined : { color: colors.text }}
          >
            {event.isCancelled ? (
              <s>{event.title || localized('(No title)')}</s>
            ) : (
              event.title || localized('(No title)')
            )}
          </div>
          {event.location && (
            <div className="agenda-event-location">
              {meetingDomain ? `${meetingDomain} - ${event.location}` : event.location}
            </div>
          )}
        </div>
      </div>
    );
  }

  _renderDay = (dayEvents: DayEvents) => {
    const { day, events } = dayEvents;
    const dayKey = day.format('YYYY-MM-DD');
    return (
      <div className="agenda-day" key={day.valueOf()}>
        {this._renderDayHeader(day)}
        <div className="agenda-day-events">
          {events.length > 0 ? (
            events.map((event) => this._renderEvent(event, dayKey))
          ) : (
            <div className="agenda-no-events">{localized('No events')}</div>
          )}
        </div>
      </div>
    );
  };

  render() {
    const days = this._getEventsByDay();
    const { rangeStart, rangeEnd } = this._calculateRange();

    const headerText = `${rangeStart.format('MMM D')} – ${rangeEnd.format('MMM D, YYYY')}`;

    return (
      <div className="calendar-view agenda-view">
        <div className="top-banner">
          <InjectedComponentSet matching={{ role: 'Calendar:Week:Banner' }} direction="row" />
        </div>

        <HeaderControls
          title={headerText}
          nextAction={this._onClickNext}
          prevAction={this._onClickPrev}
          onChangeView={this.props.onChangeView}
          disabledViewButton={CalendarView.AGENDA}
        >
          <button
            key="today"
            className="btn"
            onClick={this._onClickToday}
            style={{ position: 'absolute', left: 10 }}
          >
            {localized('Today')}
          </button>
        </HeaderControls>

        <ScrollRegion className="agenda-scroll-region">
          <div className="agenda-event-list">{days.map(this._renderDay)}</div>
        </ScrollRegion>
      </div>
    );
  }
}
