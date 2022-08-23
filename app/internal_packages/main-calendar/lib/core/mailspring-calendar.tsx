import moment, { Moment } from 'moment';
import React from 'react';
import {
  Rx,
  DatabaseStore,
  AccountStore,
  Calendar,
  Account,
  Actions,
  localized,
  DestroyModelTask,
} from 'mailspring-exports';
import {
  ScrollRegion,
  ResizableRegion,
  KeyCommandsRegion,
  MiniMonthView,
} from 'mailspring-component-kit';
import { WeekView } from './week-view';
import { MonthView } from './month-view';
import { EventSearchBar } from './event-search-bar';
import { CalendarSourceList } from './calendar-source-list';
import { CalendarDataSource, EventOccurrence } from './calendar-data-source';
import { CalendarView } from './calendar-constants';
import { Disposable } from 'rx-core';
import { CalendarEventArgs } from './calendar-event-container';
import { CalendarEventPopover } from './calendar-event-popover';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

const VIEWS = {
  [CalendarView.WEEK]: WeekView,
  [CalendarView.MONTH]: MonthView,
};

export interface EventRendererProps {
  focusedEvent: EventOccurrence;
  selectedEvents: EventOccurrence[];
  onEventClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onEventDoubleClick: (event: EventOccurrence) => void;
  onEventFocused: (event: EventOccurrence) => void;
}

export interface MailspringCalendarViewProps extends EventRendererProps {
  dataSource: CalendarDataSource;
  disabledCalendars: string[];
  focusedMoment: Moment;
  onChangeView: (view: CalendarView) => void;
  onChangeFocusedMoment: (moment: Moment) => void;
  onCalendarMouseUp: (args: CalendarEventArgs) => void;
  onCalendarMouseDown: (args: CalendarEventArgs) => void;
  onCalendarMouseMove: (args: CalendarEventArgs) => void;
}

/*
 * Mailspring Calendar
 */
interface MailspringCalendarProps {}

interface MailspringCalendarState {
  view: CalendarView;
  selectedEvents: EventOccurrence[];
  focusedEvent: EventOccurrence | null;
  accounts?: Account[];
  calendars: Calendar[];
  focusedMoment: Moment;
  disabledCalendars: string[];
}

export class MailspringCalendar extends React.Component<
  MailspringCalendarProps,
  MailspringCalendarState
> {
  static displayName = 'MailspringCalendar';

  static WeekView = WeekView;

  static containerStyles = {
    height: '100%',
  };

  _disposable?: Disposable;
  _dataSource = new CalendarDataSource();

  constructor(props) {
    super(props);
    this.state = {
      calendars: [],
      focusedEvent: null,
      selectedEvents: [],
      view: CalendarView.WEEK,
      focusedMoment: moment(),
      disabledCalendars: AppEnv.config.get(DISABLED_CALENDARS) || [],
    };
  }

  componentWillMount() {
    this._disposable = this._subscribeToCalendars();
  }

  componentWillUnmount() {
    this._disposable.dispose();
  }

  _subscribeToCalendars() {
    const calQuery = DatabaseStore.findAll<Calendar>(Calendar);
    const calQueryObs = Rx.Observable.fromQuery(calQuery);
    const accQueryObs = Rx.Observable.fromStore(AccountStore);
    const configObs = Rx.Observable.fromConfig<string[] | undefined>(DISABLED_CALENDARS);

    return Rx.Observable.combineLatest(calQueryObs, accQueryObs, configObs).subscribe(
      ([calendars, accountStore, disabledCalendars]) => {
        this.setState({
          calendars: calendars,
          accounts: accountStore.accounts(),
          disabledCalendars: disabledCalendars || [],
        });
      }
    );
  }

  onChangeView = (view: CalendarView) => {
    this.setState({ view });
  };

  onChangeFocusedMoment = (focusedMoment: Moment) => {
    this.setState({ focusedMoment, focusedEvent: null });
  };

  _focusEvent = (event: EventOccurrence) => {
    this.setState({ focusedMoment: moment(event.start * 1000), focusedEvent: event });
  };

  _openEventPopover(eventModel: EventOccurrence) {
    const eventEl = document.getElementById(eventModel.id);
    if (!eventEl) {
      return;
    }
    Actions.openPopover(<CalendarEventPopover event={eventModel} />, {
      originRect: eventEl.getBoundingClientRect(),
      direction: 'right',
      fallbackDirection: 'left',
    });
  }

  _onEventClick = (e: React.MouseEvent, event: EventOccurrence) => {
    let next = [...this.state.selectedEvents];

    if (e.shiftKey || e.metaKey) {
      const idx = next.findIndex(({ id }) => event.id === id);
      if (idx === -1) {
        next.push(event);
      } else {
        next.splice(idx, 1);
      }
    } else {
      next = [event];
    }

    this.setState({
      selectedEvents: next,
    });
  };

  _onEventDoubleClick = (occurrence: EventOccurrence) => {
    this._openEventPopover(occurrence);
  };

  _onEventFocused = (occurrence: EventOccurrence) => {
    this._openEventPopover(occurrence);
  };

  _onDeleteSelectedEvents = () => {
    if (this.state.selectedEvents.length === 0) {
      return;
    }
    const response = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'warning',
      buttons: [localized('Delete'), localized('Cancel')],
      message: localized('Delete or decline these events?'),
      detail: localized(
        `Are you sure you want to delete or decline invitations for the selected event(s)?`
      ),
    });
    if (response === 0) {
      // response is button array index
      for (const event of this.state.selectedEvents) {
        const task = new DestroyModelTask({
          modelId: event.id,
          modelName: event.constructor.name,
          endpoint: '/events',
          accountId: event.accountId,
        });
        Actions.queueTask(task);
      }
    }
  };

  _onCalendarMouseDown = () => {};
  _onCalendarMouseMove = () => {};
  _onCalendarMouseUp = () => {};

  render() {
    const CurrentView = VIEWS[this.state.view];

    return (
      <KeyCommandsRegion
        className="mailspring-calendar"
        localHandlers={{
          'core:remove-from-view': this._onDeleteSelectedEvents,
        }}
      >
        <ResizableRegion
          className="calendar-source-list"
          initialWidth={200}
          minWidth={200}
          maxWidth={300}
          handle={ResizableRegion.Handle.Right}
          style={{ flexDirection: 'column' }}
        >
          <ScrollRegion style={{ flex: 1 }}>
            <EventSearchBar
              onSelectEvent={this._focusEvent}
              disabledCalendars={this.state.disabledCalendars}
            />
            <CalendarSourceList
              accounts={this.state.accounts}
              calendars={this.state.calendars}
              disabledCalendars={this.state.disabledCalendars}
            />
          </ScrollRegion>
          <div style={{ width: '100%' }}>
            <MiniMonthView value={this.state.focusedMoment} onChange={this.onChangeFocusedMoment} />
          </div>
        </ResizableRegion>
        <CurrentView
          dataSource={this._dataSource}
          focusedMoment={this.state.focusedMoment}
          focusedEvent={this.state.focusedEvent}
          selectedEvents={this.state.selectedEvents}
          disabledCalendars={this.state.disabledCalendars}
          onChangeView={this.onChangeView}
          onChangeFocusedMoment={this.onChangeFocusedMoment}
          onCalendarMouseUp={this._onCalendarMouseUp}
          onCalendarMouseDown={this._onCalendarMouseDown}
          onCalendarMouseMove={this._onCalendarMouseMove}
          onEventClick={this._onEventClick}
          onEventDoubleClick={this._onEventDoubleClick}
          onEventFocused={this._onEventFocused}
        />
      </KeyCommandsRegion>
    );
  }
}
