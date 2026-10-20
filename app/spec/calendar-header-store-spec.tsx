import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';

import CalendarHeaderStore, {
  ViewHeader,
} from '../internal_packages/main-calendar/lib/core/calendar-header-store';
import { MonthView } from '../internal_packages/main-calendar/lib/core/month-view';
import { TimeGridView } from '../internal_packages/main-calendar/lib/core/time-grid-view';
import { CalendarDataSource } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import Rx from 'rx-lite';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import { calendarViewProps } from './fixtures/calendar-view-props';

describe('CalendarHeaderStore', function () {
  let triggered: number;
  let unlisten: () => void;
  const header = (over: Partial<ViewHeader> = {}): ViewHeader => ({
    title: 'October 2026',
    arrows: 'vertical',
    prevAction: () => {},
    nextAction: () => {},
    todayAction: () => {},
    ...over,
  });

  beforeEach(function () {
    CalendarHeaderStore.setViewHeader(null);
    CalendarHeaderStore.setControls(null);
    triggered = 0;
    unlisten = CalendarHeaderStore.listen(() => triggered++);
  });

  afterEach(() => unlisten());

  it('redraws for a new title or arrows, but keeps new actions without one', function () {
    CalendarHeaderStore.setViewHeader(header());
    expect(triggered).toBe(1);

    const nextAction = jasmine.createSpy('nextAction');
    CalendarHeaderStore.setViewHeader(header({ nextAction }));
    expect(triggered).toBe(1);
    CalendarHeaderStore.viewHeader().nextAction();
    expect(nextAction).toHaveBeenCalled();

    CalendarHeaderStore.setViewHeader(header({ title: 'November 2026' }));
    CalendarHeaderStore.setViewHeader(header({ title: 'November 2026', arrows: 'horizontal' }));
    expect(triggered).toBe(3);
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
      expect(CalendarHeaderStore.viewHeader().title).toBe('October 2026');
      expect(CalendarHeaderStore.viewHeader().arrows).toBe('vertical');
    });
    expect(CalendarHeaderStore.viewHeader()).toBe(null);
  });

  it('takes the header from the day view, and lets go of it on unmount', function () {
    const props = calendarViewProps({ focusedMoment: moment([2026, 9, 16]) });
    mounted(<TimeGridView {...props} visibleDays={1} />, () => {
      expect(CalendarHeaderStore.viewHeader().title).toBe('Friday, October 16, 2026');
      expect(CalendarHeaderStore.viewHeader().arrows).toBe('horizontal');
    });
    expect(CalendarHeaderStore.viewHeader()).toBe(null);
  });

  it('redraws when only the view changes', function () {
    CalendarHeaderStore.setControls({
      view: CalendarView.WEEK,
      onChangeView: () => {},
      agendaOpen: false,
      onToggleAgenda: () => {},
    });
    triggered = 0;
    CalendarHeaderStore.setControls({
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
      expect(CalendarHeaderStore.controls().agendaOpen).toBe(false);
      calendar.onToggleAgenda();
      expect(CalendarHeaderStore.controls().agendaOpen).toBe(true);
    });
    expect(CalendarHeaderStore.controls()).toBe(null);
  });

  it("takes the calendar's view and agenda state, redrawing when they change", function () {
    spyOn(AppEnv.config, 'set');
    const calendar: any = new MailspringCalendar({} as any);
    calendar.setState = (update: object) => Object.assign(calendar.state, update);
    calendar.state.view = CalendarView.WEEK;
    calendar._publishControls();
    expect(CalendarHeaderStore.controls().view).toBe(CalendarView.WEEK);
    expect(CalendarHeaderStore.controls().agendaOpen).toBe(false);

    calendar.onToggleAgenda();
    calendar._publishControls();
    expect(CalendarHeaderStore.controls().agendaOpen).toBe(true);
    expect(triggered).toBe(2);
  });
});
