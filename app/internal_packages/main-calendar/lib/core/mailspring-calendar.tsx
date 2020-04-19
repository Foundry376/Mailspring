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
import { ScrollRegion, ResizableRegion, KeyCommandsRegion } from 'mailspring-component-kit';
import { WeekView } from './week-view';
import { MonthView } from './month-view';
import { EventSearchBar } from './event-search-bar';
import { CalendarSourceList } from './calendar-source-list';
import { CalendarDataSource, EventOccurrence } from './calendar-data-source';
import { CalendarView } from './calendar-constants';
import { MiniMonthView } from './mini-month-view';
import { Disposable } from 'rx-core';
import { CalendarEventArgs } from './calendar-event-container';
import { CalendarEventPopover } from './calendar-event-popover';
import { remote } from 'electron';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

const VIEWS = {
  [CalendarView.WEEK]: WeekView,
  [CalendarView.MONTH]: MonthView,
};

export interface MailspringCalendarViewProps {
  dataSource: CalendarDataSource;
  focusedEvent: EventOccurrence;
  disabledCalendars: string[];
  onChangeCurrentView: (view: CalendarView) => void;
  onCalendarMouseUp: (args: CalendarEventArgs) => void;
  onCalendarMouseDown: (args: CalendarEventArgs) => void;
  onCalendarMouseMove: (args: CalendarEventArgs) => void;
  onEventClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onEventDoubleClick: (event: EventOccurrence) => void;
  onEventFocused: (event: EventOccurrence) => void;
  selectedEvents: EventOccurrence[];
}

/*
 * Mailspring Calendar
 */
interface MailspringCalendarProps {
  /*
   * The following are a set of supported interaction handlers.
   *
   * These are passed a custom set of arguments in a single object that
   * includes the `currentView` as well as things like the `time` at the
   * click coordinate.
   */
  onCalendarMouseUp?: (args: CalendarEventArgs) => void;
  onCalendarMouseDown?: (args: CalendarEventArgs) => void;
  onCalendarMouseMove?: (args: CalendarEventArgs) => void;

  onEventClick: (e: React.MouseEvent, event: EventOccurrence) => void;
  onEventDoubleClick: (event: EventOccurrence) => void;
  onEventFocused: (event: EventOccurrence) => void;
}

interface MailspringCalendarState {
  currentView: CalendarView;
  selectedEvents: EventOccurrence[];
  focusedEvent: EventOccurrence | null;
  accounts?: Account[];
  calendars: Calendar[];
  currentMoment: Moment;
  disabledCalendars: string[];
}

export class MailspringCalendar extends React.Component<
  MailspringCalendarProps,
  MailspringCalendarState
> {
  static displayName = 'MailspringCalendar';

  static WeekView = WeekView;

  static defaultProps = {
    selectedEvents: [],
  };

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
      currentView: CalendarView.WEEK,
      currentMoment: moment(),
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
    return Rx.Observable.combineLatest<any>([calQueryObs, accQueryObs, configObs]).subscribe(
      ([calendars, accountStore, disabledCalendars]: [Calendar[], any, string[] | undefined]) => {
        this.setState({
          accounts: accountStore.accounts() as Account[],
          calendars: calendars,
          disabledCalendars: disabledCalendars || [],
        });
      }
    );
  }

  onChangeCurrentView = (currentView: CalendarView) => {
    this.setState({ currentView });
  };

  onChangeCurrentMoment = (currentMoment: Moment) => {
    this.setState({ currentMoment, focusedEvent: null });
  };

  _focusEvent = (event: EventOccurrence) => {
    this.setState({ currentMoment: moment(event.start * 1000), focusedEvent: event });
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

  _onEventDoubleClick = (eventModel: EventOccurrence) => {
    this._openEventPopover(eventModel);
  };

  _onEventFocused = (eventModel: EventOccurrence) => {
    this._openEventPopover(eventModel);
  };

  _onDeleteSelectedEvents = () => {
    if (this.state.selectedEvents.length === 0) {
      return;
    }
    const response = remote.dialog.showMessageBox({
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

  render() {
    const CurrentView = VIEWS[this.state.currentView];

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
            <MiniMonthView value={this.state.currentMoment} onChange={this.onChangeCurrentMoment} />
          </div>
        </ResizableRegion>
        <CurrentView
          dataSource={this._dataSource}
          currentMoment={this.state.currentMoment}
          focusedEvent={this.state.focusedEvent}
          selectedEvents={this.state.selectedEvents}
          disabledCalendars={this.state.disabledCalendars}
          onChangeCurrentView={this.onChangeCurrentView}
          onChangeCurrentMoment={this.onChangeCurrentMoment}
          onCalendarMouseUp={this.props.onCalendarMouseUp}
          onCalendarMouseDown={this.props.onCalendarMouseDown}
          onCalendarMouseMove={this.props.onCalendarMouseMove}
          onEventClick={this.props.onEventClick}
          onEventDoubleClick={this.props.onEventDoubleClick}
          onEventFocused={this.props.onEventFocused}
        />
      </KeyCommandsRegion>
    );
  }
}
