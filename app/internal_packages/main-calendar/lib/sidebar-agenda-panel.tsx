import React from 'react';
import { Disposable } from 'rx-core';
import { Rx, DatabaseStore, Calendar, localized } from 'mailspring-exports';
import { AgendaPanel } from './core/agenda-panel';
import { CalendarDataSource, EventOccurrence } from './core/calendar-data-source';
import { setCalendarColors, invalidateThemeTextColorCache } from './core/calendar-helpers';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

interface SidebarAgendaPanelState {
  selectedEvents: EventOccurrence[];
  disabledCalendars: string[];
  calendarsLoaded: boolean;
  readOnlyCalendarIds: Set<string>;
}

/**
 * The calendar's agenda as a choice in the thread sidebar's panel switcher, with its own
 * selection. Double-clicking an event opens its popover from AgendaPanel itself.
 */
export class SidebarAgendaPanel extends React.Component<
  { active: boolean },
  SidebarAgendaPanelState
> {
  static displayName = 'SidebarAgendaPanel';
  static sidebarPanel = { id: 'calendar', title: localized('Calendar') };

  _dataSource = new CalendarDataSource();
  _disposable?: Disposable;
  _themeDisposable?: { dispose: () => void };

  state: SidebarAgendaPanelState = {
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
    // it is mounted, and it isn't while Mail shows this panel.
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
  };

  render() {
    // Panels stay mounted while hidden; skip the agenda's event query until it's shown.
    if (!this.props.active) return null;

    return (
      <div className="mailspring-calendar sidebar-agenda-panel">
        <AgendaPanel
          dataSource={this._dataSource}
          disabledCalendars={this.state.disabledCalendars}
          selectedEvents={this.state.selectedEvents}
          onEventClick={this._onEventClick}
          isCalendarReadOnly={this._isCalendarReadOnly}
        />
      </div>
    );
  }
}
