import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';

import CalendarHeaderStore, {
  ViewNavigation,
} from '../internal_packages/main-calendar/lib/core/calendar-header-store';
import { MonthView } from '../internal_packages/main-calendar/lib/core/month-view';
import { TimeGridView } from '../internal_packages/main-calendar/lib/core/time-grid-view';
import { CalendarDataSource } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import Rx from 'rx-lite';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import { calendarViewProps } from './fixtures/calendar-view-props';
import * as SheetToolbar from '../src/sheet-toolbar';

describe('CalendarHeaderStore', function () {
  let triggered: number;
  let unlisten: () => void;
  const navigation = (over: Partial<ViewNavigation> = {}): ViewNavigation => ({
    arrows: 'vertical',
    prevAction: () => {},
    nextAction: () => {},
    todayAction: () => {},
    ...over,
  });

  beforeEach(function () {
    CalendarHeaderStore.setViewNavigation(null);
    CalendarHeaderStore.setCalendarOptions(null);
    triggered = 0;
    unlisten = CalendarHeaderStore.listen(() => triggered++);
  });

  afterEach(() => unlisten());

  it('redraws for new arrows, but keeps new actions without one', function () {
    CalendarHeaderStore.setViewNavigation(navigation());
    expect(triggered).toBe(1);

    const nextAction = jasmine.createSpy('nextAction');
    CalendarHeaderStore.setViewNavigation(navigation({ nextAction }));
    expect(triggered).toBe(1);
    CalendarHeaderStore.viewNavigation().nextAction();
    expect(nextAction).toHaveBeenCalled();

    CalendarHeaderStore.setViewNavigation(navigation({ arrows: 'horizontal' }));
    expect(triggered).toBe(2);
  });

  const mounted = (element: React.ReactElement, check: () => void) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      ReactDOM.render(element, host);
      check();
      ReactDOM.unmountComponentAtNode(host);
    } finally {
      host.remove();
    }
  };

  it('takes the header from the month view, and lets go of it on unmount', function () {
    mounted(<MonthView {...calendarViewProps({ focusedMoment: moment([2026, 9, 16]) })} />, () => {
      expect(CalendarHeaderStore.viewNavigation().arrows).toBe('vertical');
    });
    expect(CalendarHeaderStore.viewNavigation()).toBe(null);
  });

  it('takes the header from the day view, and lets go of it on unmount', function () {
    const props = calendarViewProps({ focusedMoment: moment([2026, 9, 16]) });
    mounted(<TimeGridView {...props} visibleDays={1} />, () => {
      expect(CalendarHeaderStore.viewNavigation().arrows).toBe('horizontal');
    });
    expect(CalendarHeaderStore.viewNavigation()).toBe(null);
  });

  it('redraws when only the view changes', function () {
    CalendarHeaderStore.setCalendarOptions({
      view: CalendarView.WEEK,
      onChangeView: () => {},
      agendaOpen: false,
      onToggleAgenda: () => {},
    });
    triggered = 0;
    CalendarHeaderStore.setCalendarOptions({
      view: CalendarView.MONTH,
      onChangeView: () => {},
      agendaOpen: false,
      onToggleAgenda: () => {},
    });
    expect(triggered).toBe(1);
  });

  it("hands over the calendar's controls as it mounts, changes and unmounts", function () {
    spyOn(AppEnv.config, 'set');
    spyOn(MailspringCalendar.prototype, '_subscribeToCalendars').andReturn({ dispose() {} });
    spyOn(CalendarDataSource.prototype, 'buildObservable').andReturn(
      Rx.Observable.just({ events: [] })
    );
    spyOn(AppEnv.mailsyncBridge, 'sendSyncCalendarNow');
    let calendar: any;
    mounted(<MailspringCalendar ref={(c) => (calendar = c)} />, () => {
      expect(CalendarHeaderStore.calendarOptions().agendaOpen).toBe(true);
      calendar.onToggleAgenda();
      expect(CalendarHeaderStore.calendarOptions().agendaOpen).toBe(false);
    });
    expect(CalendarHeaderStore.calendarOptions()).toBe(null);
  });

  it("hands over the agenda's width only while it's on screen, redrawing as it resizes", function () {
    spyOn(AppEnv.config, 'set');
    spyOn(AppEnv, 'storeColumnWidth');
    spyOn(AppEnv, 'getColumnWidth').andReturn(undefined);
    const menuButton = spyOn(SheetToolbar, 'showsToolbarMenuControl').andReturn(false);
    const calendar: any = new MailspringCalendar({} as any);
    calendar.setState = (update: object) => Object.assign(calendar.state, update);
    calendar._publishCalendarOptions();
    expect(CalendarHeaderStore.calendarOptions().agendaWidth).toBe(240);

    triggered = 0;
    calendar._onAgendaResize(280);
    expect(CalendarHeaderStore.calendarOptions().agendaWidth).toBe(280);
    expect(triggered).toBe(1);
    calendar._onAgendaResize(400);
    expect(CalendarHeaderStore.calendarOptions().agendaWidth).toBe(300);

    calendar.setState({ calendarsLoaded: true, calendars: [] });
    calendar._publishCalendarOptions();
    expect(CalendarHeaderStore.calendarOptions().agendaWidth).toBe(null);

    calendar.setState({ calendars: [{}] });
    calendar.onToggleAgenda();
    calendar._publishCalendarOptions();
    expect(CalendarHeaderStore.calendarOptions().agendaWidth).toBe(null);

    calendar.onToggleAgenda();
    calendar._publishCalendarOptions();
    expect(CalendarHeaderStore.calendarOptions().agendaWidth).toBe(300);
    menuButton.andReturn(true);
    calendar._publishCalendarOptions();
    expect(CalendarHeaderStore.calendarOptions().agendaWidth).toBe(null);
  });

  it("takes the calendar's view and agenda state, redrawing when they change", function () {
    spyOn(AppEnv.config, 'set');
    const calendar: any = new MailspringCalendar({} as any);
    calendar.setState = (update: object) => Object.assign(calendar.state, update);
    calendar.state.view = CalendarView.WEEK;
    calendar._publishCalendarOptions();
    expect(CalendarHeaderStore.calendarOptions().view).toBe(CalendarView.WEEK);
    expect(CalendarHeaderStore.calendarOptions().agendaOpen).toBe(true);

    calendar.onToggleAgenda();
    calendar._publishCalendarOptions();
    expect(CalendarHeaderStore.calendarOptions().agendaOpen).toBe(false);
    expect(triggered).toBe(2);
  });
});
