import React from 'react';
import ReactDOM from 'react-dom';
import moment, { Moment } from 'moment';
import Rx from 'rx-lite';

import { TimeGridView } from '../internal_packages/main-calendar/lib/core/time-grid-view';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import { calendarDateFromUnix, calendarDaysBetween } from '../src/calendar-date';
import { allDayOccurrence, calendarViewProps } from './fixtures/calendar-view-props';

describe('TimeGridView scrolling', function () {
  let dataSource: { buildObservable: jasmine.Spy };
  let host: HTMLDivElement;
  let onChangeFocusedMoment: jasmine.Spy;
  let view: TimeGridView;
  let visibleDays: 1 | 7;

  const render = (focusedMoment: Moment, focusedEvent = null) => {
    ReactDOM.render(
      <TimeGridView
        ref={(v) => (view = v)}
        visibleDays={visibleDays}
        {...calendarViewProps({
          dataSource: dataSource as any,
          focusedMoment,
          focusedEvent,
          onChangeFocusedMoment,
        })}
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
  // Holds every glide in flight, so the first day in view stays where the presses began.
  const holdGlides = () => {
    const scrollTo = strip().scrollTo.bind(strip());
    spyOn(strip(), 'scrollTo').andCallFake((options: ScrollToOptions) => {
      if (options.behavior !== 'smooth') scrollTo(options);
    });
  };

  beforeEach(function () {
    visibleDays = 7;
    dataSource = {
      buildObservable: jasmine
        .createSpy('buildObservable')
        .andCallFake(() => Rx.Observable.just({ events: [] })),
    };
    // Re-renders inside the call, as FocusedMomentStore's synchronous trigger does in the app.
    onChangeFocusedMoment = jasmine
      .createSpy('onChangeFocusedMoment')
      .andCallFake((m: Moment) => render(m));
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

  describe('going to the nearest week start', function () {
    it('from mid-week, goes ahead to the next week start', function () {
      render(moment([2026, 9, 19]));
      scrollDays(3);
      strip().dispatchEvent(new Event('scrollend'));
      const wednesday = strip().scrollLeft;
      holdGlides();

      view.navigate(1);
      expect(lastScroll().left).toBe(wednesday + 4 * 100);
    });

    it('from mid-week, goes back to the start of that week', function () {
      render(moment([2026, 9, 19]));
      scrollDays(3);
      strip().dispatchEvent(new Event('scrollend'));
      const wednesday = strip().scrollLeft;
      holdGlides();

      view.navigate(-1);
      expect(lastFocus()).toBe('Mon 2026-10-19');
      expect(lastScroll().left).toBe(wednesday - 3 * 100);
    });

    it('from a lined-up week, moves a whole week either way', function () {
      render(moment([2026, 9, 19]));
      const sunday = strip().scrollLeft;
      holdGlides();

      view.navigate(-1);
      expect(lastFocus()).toBe('Mon 2026-10-12');
      expect(lastScroll().left).toBe(sunday - 7 * 100);
    });

    it('counts every press made while the glide is still on its way', function () {
      render(moment([2026, 9, 19]));
      const sunday = strip().scrollLeft;
      holdGlides();

      view.navigate(1);
      view.navigate(1);
      expect(lastFocus()).toBe('Mon 2026-11-02');
      expect(lastScroll().left).toBe(sunday + 14 * 100);
    });
  });

  it('steps a day at a time in Day view, keeping the time', function () {
    visibleDays = 1;
    document.getElementById('time-grid-scroll-spec').textContent +=
      '.calendar-area-wrap { width: 100px; }';
    render(moment([2026, 9, 21, 9, 30]));
    expect(title()).toBe('Wednesday, October 21, 2026');

    view.navigate(1);
    expect(lastFocus()).toBe('Thu 2026-10-22');
    expect((onChangeFocusedMoment.mostRecentCall.args[0] as Moment).format('HH:mm')).toBe('09:30');
  });

  it('jumps rather than glides to the week of an event it reveals', function () {
    render(moment([2026, 9, 21]));
    spyOn(strip(), 'scrollTo').andCallThrough();

    render(moment([2026, 9, 27]), { id: 'evt', start: moment([2026, 9, 27]).unix() });
    expect(lastScroll().behavior).toBe('instant');
    expect(firstInView()).toBe('25Sun');
  });

  it('sizes the All Day row for the days drawn, not every event loaded', function () {
    // Four weeks on: loaded, but well past the three weeks drawn around Oct 18-24.
    const farOff = allDayOccurrence('far-off', '2026-11-16');
    dataSource.buildObservable.andCallFake(() => Rx.Observable.just({ events: [farOff] }));
    render(moment([2026, 9, 19]));

    const legend = host.querySelector('.date-label-legend') as HTMLElement;
    expect(legend.style.height).toBe('76px');
  });

  it('requeries once scrolling draws days outside the last query', function () {
    render(moment([2026, 9, 21]));
    const queriedFrom = () =>
      calendarDateFromUnix(dataSource.buildObservable.mostRecentCall.args[0].startUnix);
    const firstQueried = queriedFrom();

    for (let week = 0; week < 5; week++) {
      scrollDays(7);
    }
    expect(dataSource.buildObservable.callCount).toBeGreaterThan(1);
    expect(calendarDaysBetween(firstQueried, queriedFrom())).toBeGreaterThan(0);
  });
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

  it('holds the grid it asks', function () {
    const cal: any = new MailspringCalendar({} as any);
    for (const view of [CalendarView.DAY, CalendarView.WEEK]) {
      cal.state = { ...cal.state, view };
      expect(cal._renderMainContent().ref).toBe(cal._timeGrid);
    }
  });
});
