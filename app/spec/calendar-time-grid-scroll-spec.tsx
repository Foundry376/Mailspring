import React from 'react';
import ReactDOM from 'react-dom';
import moment, { Moment } from 'moment';
import Rx from 'rx-lite';

import { TimeGridView } from '../internal_packages/main-calendar/lib/core/time-grid-view';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';

const NO_CALENDARS: string[] = [];

describe('TimeGridView scrolling', function () {
  const dataSource = { buildObservable: () => Rx.Observable.just({ events: [] }) };
  let host: HTMLDivElement;
  let onChangeFocusedMoment: jasmine.Spy;
  let view: TimeGridView;
  let days: number;

  const render = (focusedMoment: Moment) => {
    ReactDOM.render(
      <TimeGridView
        ref={(v) => (view = v)}
        days={days}
        {...({
          dataSource,
          disabledCalendars: NO_CALENDARS,
          focusedMoment,
          focusedEvent: null,
          selectedEvents: [],
          onChangeView: () => {},
          onChangeFocusedMoment,
          onCalendarMouseUp: () => {},
          onCalendarMouseDown: () => {},
          onCalendarMouseMove: () => {},
          onCalendarClick: () => {},
          onCalendarDoubleClick: () => {},
          onCalendarContextMenu: () => {},
          onEventClick: () => {},
          onEventDoubleClick: () => {},
          onEventContextMenu: () => {},
          onEventFocused: () => {},
          onEventDragStart: () => {},
          dragState: null,
          newEventPreview: null,
          readOnlyCalendarIds: new Set(),
          isCalendarReadOnly: () => false,
          paintVersion: '',
        } as any)}
      />,
      host
    );
  };

  const strip = () => host.querySelector('.calendar-area-wrap') as HTMLElement;
  const title = () => host.querySelector('.header-controls .title').textContent;
  const firstInView = () => {
    const left = strip().getBoundingClientRect().left;
    return Array.from(host.querySelectorAll('.day-label-wrap')).find(
      (label) => Math.abs(label.getBoundingClientRect().left - left) < 1
    )?.textContent;
  };
  const scrollDays = (count: number) => {
    strip().scrollLeft += count * 100;
    strip().dispatchEvent(new Event('scroll'));
  };
  const lastFocus = () =>
    (onChangeFocusedMoment.mostRecentCall.args[0] as Moment).format('ddd YYYY-MM-DD');
  const lastScroll = () => (strip().scrollTo as jasmine.Spy).mostRecentCall.args[0];

  beforeEach(function () {
    days = 7;
    // Re-renders inside the call, as FocusedMomentStore's synchronous trigger does in the app.
    onChangeFocusedMoment = jasmine.createSpy('onChangeFocusedMoment').andCallFake(render);
    host = document.createElement('div');
    document.body.appendChild(host);
    // Specs load core styles but not the calendar package's, which size the strip in the app.
    const style = document.createElement('style');
    style.id = 'time-grid-scroll-spec';
    style.textContent =
      '.calendar-area-wrap { width: 700px; height: 500px; } ' +
      '.date-labels { display: flex; } .day-label-wrap { flex: 1; min-width: 0; }';
    document.head.appendChild(style);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    document.getElementById('time-grid-scroll-spec').remove();
  });

  it('lines up on the week of its focused date, and titles the days in view', function () {
    render(moment([2026, 9, 21]));
    expect(firstInView()).toBe('18Sun');
    expect(title()).toBe('October 18 - October 24 2026');

    scrollDays(3);
    expect(title()).toBe('October 21 - October 27 2026');
  });

  it('moves the focused date into view on its weekday when a scroll stops, and stays put', function () {
    render(moment([2026, 9, 19]));
    spyOn(strip(), 'scrollTo').andCallThrough();

    // Wed 21 to Tue 27 is in view; Monday the 19th has gone, so the focus moves to Monday the 26th.
    scrollDays(3);
    strip().dispatchEvent(new Event('scrollend'));
    expect(lastFocus()).toBe('Mon 2026-10-26');
    expect(strip().scrollTo).not.toHaveBeenCalled();
  });

  it('goes to the nearest week start behind or ahead of the first day in view', function () {
    render(moment([2026, 9, 19]));
    scrollDays(3);
    strip().dispatchEvent(new Event('scrollend'));
    spyOn(strip(), 'scrollTo').andCallThrough();
    const wednesday = strip().scrollLeft;

    view.navigate(-1);
    expect(lastFocus()).toBe('Mon 2026-10-19');
    expect(lastScroll().left).toBe(wednesday - 3 * 100);

    view.navigate(1);
    expect(lastScroll().left).toBe(wednesday + 4 * 100);
  });

  it('steps a day at a time in Day view', function () {
    days = 1;
    style('.calendar-area-wrap { width: 100px; }');
    render(moment([2026, 9, 21, 9, 30]));
    expect(title()).toBe('Wednesday, October 21, 2026');

    view.navigate(1);
    expect(lastFocus()).toBe('Thu 2026-10-22');
    expect((onChangeFocusedMoment.mostRecentCall.args[0] as Moment).format('HH:mm')).toBe('09:30');
  });

  function style(css: string) {
    document.getElementById('time-grid-scroll-spec').textContent += css;
  }
});

describe('MailspringCalendar navigating Day and Week', function () {
  it('asks the grid, which knows which day is first in view', function () {
    const cal: any = new MailspringCalendar({} as any);
    const navigate = jasmine.createSpy('navigate');
    cal._timeGrid = { current: { navigate } };
    for (const view of [CalendarView.DAY, CalendarView.WEEK]) {
      cal.state = { ...cal.state, view };
      cal._onNavigateNext();
      cal._onNavigatePrevious();
    }
    expect(navigate.calls.map((c) => c.args[0])).toEqual([1, -1, 1, -1]);
  });
});
