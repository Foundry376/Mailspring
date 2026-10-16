import React from 'react';
import moment, { Moment } from 'moment';
import { Disposable } from 'rx-core';
import { Rx, DatabaseStore, Calendar, localized } from 'mailspring-exports';
import { AgendaView } from './core/agenda-view';
import { CalendarDataSource, EventOccurrence } from './core/calendar-data-source';
import { setCalendarColors, invalidateThemeTextColorCache } from './core/calendar-helpers';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

const noop = () => {};

interface SidebarAgendaPanelState {
  focusedMoment: Moment;
  selectedEvents: EventOccurrence[];
  disabledCalendars: string[];
  calendarsLoaded: boolean;
  readOnlyCalendarIds: Set<string>;
}

/**
 * The calendar's agenda as a choice in the thread sidebar's panel switcher. It keeps its own
 * date rather than sharing FocusedMomentStore, so paging the sidebar doesn't move the Calendar.
 * Double-clicking an event opens its popover from AgendaView itself.
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
    focusedMoment: moment(),
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

  _onChangeFocusedMoment = (focusedMoment: Moment) => {
    this.setState({ focusedMoment });
  };

  _onEventClick = (e: React.MouseEvent, event: EventOccurrence) => {
    this.setState({ selectedEvents: [event] });
  };

  render() {
    // Panels stay mounted while hidden; skip the agenda's event query until it's shown.
    if (!this.props.active) return null;

    return (
      <div className="mailspring-calendar sidebar-agenda-panel">
        <AgendaView
          dataSource={this._dataSource}
          disabledCalendars={this.state.disabledCalendars}
          focusedMoment={this.state.focusedMoment}
          focusedEvent={null}
          selectedEvents={this.state.selectedEvents}
          onChangeView={noop}
          onChangeFocusedMoment={this._onChangeFocusedMoment}
          onEventClick={this._onEventClick}
          onEventDoubleClick={noop}
          onEventContextMenu={noop}
          onEventFocused={noop}
          onCalendarMouseUp={noop}
          onCalendarMouseDown={noop}
          onCalendarMouseMove={noop}
          onCalendarClick={noop}
          onCalendarDoubleClick={noop}
          onCalendarContextMenu={noop}
          paintVersion=""
          dragState={null}
          createDrag={null}
          onEventDragStart={noop}
          readOnlyCalendarIds={this.state.readOnlyCalendarIds}
          isCalendarReadOnly={this._isCalendarReadOnly}
        />
      </div>
    );
  }
}
