import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';

import CalendarHeaderStore, {
  ViewHeader,
} from '../internal_packages/main-calendar/lib/core/calendar-header-store';
import { MonthView } from '../internal_packages/main-calendar/lib/core/month-view';
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

  it('takes the header from the month view, and lets go of it on unmount', function () {
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      ReactDOM.render(
        <MonthView {...calendarViewProps({ focusedMoment: moment([2026, 9, 16]) })} />,
        host
      );
      expect(CalendarHeaderStore.viewHeader().title).toBe('October 2026');
      expect(CalendarHeaderStore.viewHeader().arrows).toBe('vertical');
      ReactDOM.unmountComponentAtNode(host);
      expect(CalendarHeaderStore.viewHeader()).toBe(null);
    } finally {
      host.remove();
    }
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
