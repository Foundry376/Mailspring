import moment, { Moment } from 'moment';
import React from 'react';
import {
  Rx,
  DatabaseStore,
  AccountStore,
  Calendar,
  Event,
  Actions,
  localized,
} from 'mailspring-exports';
import { RetinaImg, ScrollRegion } from 'mailspring-component-kit';
import {
  CalendarDataSource,
  EventOccurrence,
} from '../../main-calendar/lib/core/calendar-data-source';
import { Disposable } from 'rx-core';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

interface SidebarCalendarDayViewState {
  focusedMoment: Moment;
  events: EventOccurrence[];
  disabledCalendars: string[];
}

export class SidebarCalendarDayView extends React.Component<{}, SidebarCalendarDayViewState> {
  static displayName = 'SidebarCalendarDayView';

  _dataSource = new CalendarDataSource();
  _configDisposable?: Disposable;
  _eventDisposable?: Disposable;

  constructor(props: {}) {
    super(props);
    this.state = {
      focusedMoment: moment(),
      events: [],
      disabledCalendars: AppEnv.config.get(DISABLED_CALENDARS) || [],
    };
  }

  componentDidMount() {
    this._configDisposable = Rx.Observable.fromConfig<string[] | undefined>(
      DISABLED_CALENDARS
    ).subscribe((disabledCalendars) => {
      this.setState({ disabledCalendars: disabledCalendars || [] }, () => {
        this._subscribeToEvents();
      });
    });
    this._subscribeToEvents();
  }

  componentWillUnmount() {
    this._configDisposable?.dispose();
    this._eventDisposable?.dispose();
  }

  _subscribeToEvents() {
    this._eventDisposable?.dispose();

    const { focusedMoment, disabledCalendars } = this.state;
    const startOfDay = focusedMoment.clone().startOf('day');
    const endOfDay = focusedMoment.clone().endOf('day');

    this._eventDisposable = this._dataSource
      .buildObservable({
        disabledCalendars,
        startUnix: startOfDay.unix(),
        endUnix: endOfDay.unix(),
      })
      .subscribe(({ events }) => {
        const sorted = events
          .filter((e) => !e.isCancelled)
          .sort((a, b) => {
            if (a.isAllDay && !b.isAllDay) return -1;
            if (!a.isAllDay && b.isAllDay) return 1;
            return a.start - b.start;
          });
        this.setState({ events: sorted });
      });
  }

  _onClickToday = () => {
    this.setState({ focusedMoment: moment() }, () => this._subscribeToEvents());
  };

  _onClickPrevDay = () => {
    this.setState({ focusedMoment: this.state.focusedMoment.clone().subtract(1, 'day') }, () =>
      this._subscribeToEvents()
    );
  };

  _onClickNextDay = () => {
    this.setState({ focusedMoment: this.state.focusedMoment.clone().add(1, 'day') }, () =>
      this._subscribeToEvents()
    );
  };

  _onClickEvent = (event: EventOccurrence) => {
    Actions.focusCalendarEvent({ id: event.id, start: event.start });
  };

  _formatEventTime(event: EventOccurrence) {
    if (event.isAllDay) {
      return localized('All Day');
    }
    const start = moment.unix(event.start).format('LT');
    const end = moment.unix(event.end).format('LT');
    return `${start} - ${end}`;
  }

  _isToday() {
    return this.state.focusedMoment.isSame(moment(), 'day');
  }

  render() {
    const { focusedMoment, events } = this.state;
    const isToday = this._isToday();
    const dateLabel = isToday ? localized('Today') : focusedMoment.format('ddd, MMM D');

    return (
      <div className="sidebar-calendar-day-view">
        <div className="sidebar-calendar-header">
          <button className="btn btn-small btn-nav" onClick={this._onClickPrevDay}>
            <RetinaImg name="toolbar-chevron-left.png" mode={RetinaImg.Mode.ContentIsMask} />
          </button>
          <span
            className="sidebar-calendar-date"
            onClick={this._onClickToday}
            title={localized('Go to today')}
          >
            {dateLabel}
          </span>
          <button className="btn btn-small btn-nav" onClick={this._onClickNextDay}>
            <RetinaImg name="toolbar-chevron-right.png" mode={RetinaImg.Mode.ContentIsMask} />
          </button>
        </div>
        <ScrollRegion className="sidebar-calendar-events">
          {events.length === 0 ? (
            <div className="sidebar-calendar-empty">{localized('No events')}</div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className={`sidebar-calendar-event ${event.isPending ? 'pending' : ''}`}
                onClick={() => this._onClickEvent(event)}
              >
                <div className="event-time">{this._formatEventTime(event)}</div>
                <div className="event-title">{event.title || localized('(No title)')}</div>
                {event.location ? <div className="event-location">{event.location}</div> : null}
              </div>
            ))
          )}
        </ScrollRegion>
      </div>
    );
  }
}
