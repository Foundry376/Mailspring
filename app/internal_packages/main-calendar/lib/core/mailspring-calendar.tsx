import moment, { Moment } from 'moment';
import React from 'react';
import { Rx, DatabaseStore, AccountStore, Calendar, Account, Event } from 'mailspring-exports';
import { ScrollRegion, ResizableRegion } from 'mailspring-component-kit';
import WeekView from './week-view';
import MonthView from './month-view';
import EventSearchBar from './event-search-bar';
import CalendarToggles from './calendar-toggles';
import CalendarDataSource from './calendar-data-source';
import { WEEK_VIEW, MONTH_VIEW } from './calendar-constants';
import MiniMonthView from './mini-month-view';
import { Disposable } from 'rx-core';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

/*
 * Mailspring Calendar
 */
interface MailspringCalendarProps {
  /*
     * The data source that powers all of the views of the MailspringCalendar
     */
  dataSource: CalendarDataSource;

  currentMoment?: Moment;

  /*
     * Any extra info you want to display on the top banner of calendar
     * components
     */
  bannerComponents?: {
    day: React.ReactChild;
    week: React.ReactChild;
    month: React.ReactChild;
    year: React.ReactChild;
  };

  /*
     * Any extra header components for each of the supported View types of
     * the MailspringCalendar
     */
  headerComponents?: {
    day: React.ReactChild;
    week: React.ReactChild;
    month: React.ReactChild;
    year: React.ReactChild;
  };

  /*
     * Any extra footer components for each of the supported View types of
     * the MailspringCalendar
     */
  footerComponents?: {
    day: React.ReactChild;
    week: React.ReactChild;
    month: React.ReactChild;
    year: React.ReactChild;
  };

  /*
     * The following are a set of supported interaction handlers.
     *
     * These are passed a custom set of arguments in a single object that
     * includes the `currentView` as well as things like the `time` at the
     * click coordinate.
     */
  onCalendarMouseUp?: () => void;
  onCalendarMouseDown?: () => void;
  onCalendarMouseMove?: () => void;

  onEventClick: (e: React.MouseEvent, event: Event) => void;
  onEventDoubleClick: (event: Event) => void;
  onEventFocused: (event: Event) => void;

  selectedEvents: Event[];
}

interface MailspringCalendarState {
  currentView: string;
  focusedEvent: Event | null;
  accounts?: Account[];
  calendars: Calendar[];
  currentMoment: Moment;
  disabledCalendars: string[];
}

export default class MailspringCalendar extends React.Component<MailspringCalendarProps, MailspringCalendarState> {
  static displayName = 'MailspringCalendar';

  static WeekView = WeekView;

  static defaultProps = {
    bannerComponents: { day: false, week: false, month: false, year: false },
    headerComponents: { day: false, week: false, month: false, year: false },
    footerComponents: { day: false, week: false, month: false, year: false },
    selectedEvents: [],
  };

  static containerStyles = {
    height: '100%',
  };

  _disposable?: Disposable;

  constructor(props) {
    super(props);
    this.state = {
      calendars: [],
      focusedEvent: null,
      currentView: WEEK_VIEW,
      currentMoment: props.currentMoment || this._now(),
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

  _now() {
    return moment();
  }

  _getCurrentViewComponent() {
    const components = {};
    components[WEEK_VIEW] = WeekView;
    components[MONTH_VIEW] = MonthView;
    return components[this.state.currentView];
  }

  _changeCurrentView = currentView => {
    this.setState({ currentView });
  };

  _changeCurrentMoment = currentMoment => {
    this.setState({ currentMoment, focusedEvent: null });
  };

  _changeCurrentMomentFromValue = value => {
    this.setState({ currentMoment: moment(value), focusedEvent: null });
  };

  _focusEvent = event => {
    const value = event.start * 1000;
    this.setState({ currentMoment: moment(value), focusedEvent: event });
  };

  render() {
    const CurrentView = this._getCurrentViewComponent();
    return (
      <div className="mailspring-calendar">
        <ResizableRegion
          className="calendar-toggles"
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
            <CalendarToggles
              accounts={this.state.accounts}
              calendars={this.state.calendars}
              disabledCalendars={this.state.disabledCalendars}
            />
          </ScrollRegion>
          <div style={{ width: '100%' }}>
            <MiniMonthView
              value={this.state.currentMoment.valueOf()}
              onChange={this._changeCurrentMomentFromValue}
            />
          </div>
        </ResizableRegion>
        <CurrentView
          dataSource={this.props.dataSource}
          currentMoment={this.state.currentMoment}
          focusedEvent={this.state.focusedEvent}
          bannerComponents={this.props.bannerComponents[this.state.currentView]}
          headerComponents={this.props.headerComponents[this.state.currentView]}
          footerComponents={this.props.footerComponents[this.state.currentView]}
          changeCurrentView={this._changeCurrentView}
          disabledCalendars={this.state.disabledCalendars}
          changeCurrentMoment={this._changeCurrentMoment}
          onCalendarMouseUp={this.props.onCalendarMouseUp}
          onCalendarMouseDown={this.props.onCalendarMouseDown}
          onCalendarMouseMove={this.props.onCalendarMouseMove}
          selectedEvents={this.props.selectedEvents}
          onEventClick={this.props.onEventClick}
          onEventDoubleClick={this.props.onEventDoubleClick}
          onEventFocused={this.props.onEventFocused}
        />
      </div>
    );
  }
}
