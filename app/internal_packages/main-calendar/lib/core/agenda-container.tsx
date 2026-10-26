import React from 'react';
import classnames from 'classnames';
import { Disposable } from 'rx-core';
import { Rx, DatabaseStore, Calendar } from 'mailspring-exports';
import { AgendaPanel } from './agenda-panel';
import { CalendarDataSource, EventOccurrence } from './calendar-data-source';
import { setCalendarColors, invalidateThemeTextColorCache } from './calendar-helpers';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

interface AgendaContainerProps {
  className?: string;
  // Given by the calendar, whose grid shares the selection; the mail sidebar's agenda keeps its own.
  selectedEvents?: EventOccurrence[];
  onEventClick?: (e: React.MouseEvent, event: EventOccurrence) => void;
  onEventDoubleClick?: (event: EventOccurrence) => void;
}

interface AgendaContainerState {
  selectedEvents: EventOccurrence[];
  disabledCalendars: string[];
  calendarsLoaded: boolean;
  readOnlyCalendarIds: Set<string>;
}

/**
 * An AgendaPanel that loads its own calendars and events and keeps its own selection, for
 * places outside the calendar grid. Double-clicking an event opens its popover from AgendaPanel.
 */
export class AgendaContainer extends React.Component<AgendaContainerProps, AgendaContainerState> {
  static displayName = 'AgendaContainer';

  _dataSource = new CalendarDataSource();
  _disposable?: Disposable;
  _themeDisposable?: { dispose: () => void };

  state: AgendaContainerState = {
    selectedEvents: [],
    disabledCalendars: AppEnv.config.get(DISABLED_CALENDARS) || [],
    calendarsLoaded: false,
    readOnlyCalendarIds: new Set<string>(),
  };

  componentDidMount() {
    this._disposable = Rx.Observable.combineLatest(
      Rx.Observable.fromQuery(DatabaseStore.findAll<Calendar>(Calendar)),
      Rx.Observable.fromConfig<string[] | undefined>(DISABLED_CALENDARS)
    ).subscribe(([calendars, disabledCalendars]) => {
      // Event colours come from this cache, which nothing else fills until the Calendar opens.
      setCalendarColors(calendars);
      this.setState({
        calendarsLoaded: true,
        disabledCalendars: disabledCalendars || [],
        readOnlyCalendarIds: new Set(calendars.filter((c) => c.readOnly).map((c) => c.id)),
      });
    });
    // Titles mix in the theme's cached text colour, which MailspringCalendar only clears while
    // it is mounted, and it isn't while Mail shows the agenda.
    invalidateThemeTextColorCache();
    this._themeDisposable = AppEnv.themes.onDidChangeActiveThemes(() => {
      invalidateThemeTextColorCache();
      this.forceUpdate();
    });
  }

  componentWillUnmount() {
    this._disposable?.dispose();
    this._themeDisposable?.dispose();
  }

  // Fails closed until calendars load, matching MailspringCalendar._isCalendarReadOnly.
  _isCalendarReadOnly = (calendarId: string) => {
    return !this.state.calendarsLoaded || this.state.readOnlyCalendarIds.has(calendarId);
  };

  _onEventClick = (e: React.MouseEvent, event: EventOccurrence) => {
    this.setState({ selectedEvents: [event] });
    this.props.onEventClick?.(e, event);
  };

  render() {
    return (
      <div className={classnames('mailspring-calendar', this.props.className)}>
        <AgendaPanel
          dataSource={this._dataSource}
          disabledCalendars={this.state.disabledCalendars}
          selectedEvents={this.props.selectedEvents ?? this.state.selectedEvents}
          onEventClick={this._onEventClick}
          onEventDoubleClick={this.props.onEventDoubleClick}
          isCalendarReadOnly={this._isCalendarReadOnly}
        />
      </div>
    );
  }
}
