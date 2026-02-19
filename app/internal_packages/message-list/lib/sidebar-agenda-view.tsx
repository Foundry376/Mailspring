import moment, { Moment } from 'moment';
import React from 'react';
import { Rx, DatabaseStore, Calendar, Actions, localized } from 'mailspring-exports';
import {
  CalendarDataSource,
  EventOccurrence,
  FocusedEventInfo,
} from '../../main-calendar/lib/core/calendar-data-source';
import { AgendaView } from '../../main-calendar/lib/core/agenda-view';
import { CalendarView } from '../../main-calendar/lib/core/calendar-constants';
import { CalendarEventPopover } from '../../main-calendar/lib/core/calendar-event-popover';
import { Disposable } from 'rx-core';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

interface SidebarAgendaViewState {
  focusedMoment: Moment;
  selectedEvents: EventOccurrence[];
  focusedEvent: FocusedEventInfo | null;
  disabledCalendars: string[];
  calendars: Calendar[];
}

export class SidebarAgendaView extends React.Component<{}, SidebarAgendaViewState> {
  static displayName = 'SidebarAgendaView';

  _dataSource = new CalendarDataSource();
  _configDisposable?: Disposable;
  _calDisposable?: Disposable;

  constructor(props: {}) {
    super(props);
    this.state = {
      focusedMoment: moment(),
      selectedEvents: [],
      focusedEvent: null,
      disabledCalendars: AppEnv.config.get(DISABLED_CALENDARS) || [],
      calendars: [],
    };
  }

  componentDidMount() {
    this._configDisposable = Rx.Observable.fromConfig<string[] | undefined>(
      DISABLED_CALENDARS
    ).subscribe((disabledCalendars) => {
      this.setState({ disabledCalendars: disabledCalendars || [] });
    });

    const calQuery = DatabaseStore.findAll<Calendar>(Calendar);
    this._calDisposable = Rx.Observable.fromQuery(calQuery).subscribe((calendars) => {
      this.setState({ calendars });
    });
  }

  componentWillUnmount() {
    this._configDisposable?.dispose();
    this._calDisposable?.dispose();
  }

  _getReadOnlyCalendarIds(): Set<string> {
    const ids = new Set<string>();
    for (const cal of this.state.calendars) {
      if (cal.readOnly) {
        ids.add(cal.id);
      }
    }
    return ids;
  }

  _onChangeFocusedMoment = (m: Moment) => {
    this.setState({ focusedMoment: m, focusedEvent: null });
  };

  _onChangeView = () => {
    // No-op in the sidebar — we always show the agenda view
  };

  _onEventClick = (e: React.MouseEvent, event: EventOccurrence) => {
    this.setState({ selectedEvents: [event], focusedEvent: null });
  };

  _onEventDoubleClick = (event: EventOccurrence) => {
    const el = document.getElementById(event.id);
    if (!el) return;
    Actions.openPopover(<CalendarEventPopover event={event} />, {
      originRect: el.getBoundingClientRect(),
      direction: 'left',
      fallbackDirection: 'right',
      closeOnAppBlur: false,
    });
  };

  _onEventFocused = (event: EventOccurrence) => {
    this._onEventDoubleClick(event);
  };

  // No-ops for drag and mouse handlers — not needed in sidebar
  _noopMouseHandler = () => {};
  _noopDragStart = () => {};

  render() {
    return (
      <div className="sidebar-agenda-view mailspring-calendar">
        <AgendaView
          dataSource={this._dataSource}
          disabledCalendars={this.state.disabledCalendars}
          focusedMoment={this.state.focusedMoment}
          focusedEvent={this.state.focusedEvent}
          selectedEvents={this.state.selectedEvents}
          onChangeView={this._onChangeView}
          onChangeFocusedMoment={this._onChangeFocusedMoment}
          onEventClick={this._onEventClick}
          onEventDoubleClick={this._onEventDoubleClick}
          onEventFocused={this._onEventFocused}
          onCalendarMouseUp={this._noopMouseHandler}
          onCalendarMouseDown={this._noopMouseHandler}
          onCalendarMouseMove={this._noopMouseHandler}
          dragState={null}
          onEventDragStart={this._noopDragStart}
          readOnlyCalendarIds={this._getReadOnlyCalendarIds()}
        />
      </div>
    );
  }
}
