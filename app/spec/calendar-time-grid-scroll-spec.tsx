import React from 'react';
import ReactDOM from 'react-dom';
import moment, { Moment } from 'moment';
import Rx from 'rx-lite';

import { TimeGridView } from '../internal_packages/main-calendar/lib/core/time-grid-view';
import { MailspringCalendar } from '../internal_packages/main-calendar/lib/core/mailspring-calendar';
import { CalendarView } from '../internal_packages/main-calendar/lib/core/calendar-constants';
import { calendarDateFromUnix, calendarDaysBetween } from '../src/calendar-date';
import {
  allDayOccurrence,
  calendarViewProps,
  timedOccurrence,
} from './fixtures/calendar-view-props';
import { holdGlides } from './fixtures/hold-glides';

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
  const restScroll = () => strip().dispatchEvent(new Event('scrollend'));
  const height = (selector: string) => (host.querySelector(selector) as HTMLElement).style.height;

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
    restScroll();
    expect(lastFocus()).toBe('Mon 2026-10-26');
    expect(strip().scrollTo).not.toHaveBeenCalled();
  });

  describe('going to the nearest week start', function () {
    it('from mid-week, goes ahead to the next week start', function () {
      render(moment([2026, 9, 19]));
      scrollDays(3);
      restScroll();
      const wednesday = strip().scrollLeft;
      holdGlides(strip());

      view.navigate(1);
      expect(lastScroll().left).toBe(wednesday + 4 * 100);
    });

    it('from mid-week, goes back to the start of that week', function () {
      render(moment([2026, 9, 19]));
      scrollDays(3);
      restScroll();
      const wednesday = strip().scrollLeft;
      holdGlides(strip());

      view.navigate(-1);
      expect(lastFocus()).toBe('Mon 2026-10-19');
      expect(lastScroll().left).toBe(wednesday - 3 * 100);
    });

    it('from a lined-up week, glides back a whole week, to the first day drawn', function () {
      render(moment([2026, 9, 19]));
      const sunday = strip().scrollLeft;
      holdGlides(strip());

      view.navigate(-1);
      expect(lastFocus()).toBe('Mon 2026-10-12');
      expect(lastScroll()).toEqual({ left: sunday - 7 * 100, behavior: 'smooth' });
    });

    it('counts every press made while the glide is still on its way', function () {
      render(moment([2026, 9, 19]));
      const sunday = strip().scrollLeft;
      holdGlides(strip());

      view.navigate(1);
      view.navigate(1);
      expect(lastFocus()).toBe('Mon 2026-11-02');
      expect(lastScroll().left).toBe(sunday + 14 * 100);
    });

    it('counts a press made after the hours are scrolled mid-glide', function () {
      render(moment([2026, 9, 19]));
      const sunday = strip().scrollLeft;
      holdGlides(strip());

      view.navigate(1);
      const hours = host.querySelector('.event-grid-wrap');
      hours.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 }));
      view.navigate(1);
      expect(lastScroll().left).toBe(sunday + 14 * 100);
    });

    it('goes from the week a focus change heads back to, while an earlier glide is on its way', function () {
      render(moment([2026, 9, 19]));
      const sunday = strip().scrollLeft;
      holdGlides(strip());

      view.navigate(1);
      // Three days along to the 25th, Today (here the 20th) heads back to this week.
      scrollDays(3);
      render(moment([2026, 9, 20]));
      view.navigate(1);
      expect(lastScroll().left).toBe(sunday + 7 * 100);
    });

    it('goes from where a scroll comes to rest once a glide has landed', function () {
      render(moment([2026, 9, 19]));
      const sunday = strip().scrollLeft;
      holdGlides(strip());
      // Off, or the browser snaps the scroll back onto the days drawn before it.
      strip().style.scrollSnapType = 'none';

      view.navigate(1);
      // The glide lands on the 25th, then a scroll back comes to rest on Thursday the 15th.
      scrollDays(7);
      restScroll();
      scrollDays(-10);
      restScroll();
      view.navigate(1);
      expect(lastScroll().left).toBe(sunday);
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

  it('jumps back to a week past the days drawn, where a glide would stop short', function () {
    render(moment([2026, 10, 2]));
    spyOn(strip(), 'scrollTo').andCallThrough();
    // Today, here the 20th, is two weeks back.
    render(moment([2026, 9, 20]));
    expect(lastScroll().behavior).toBe('instant');
    expect(firstInView()).toBe('18Sun');
  });

  it('jumps rather than glides to the week of an event it reveals', function () {
    render(moment([2026, 9, 21]));
    spyOn(strip(), 'scrollTo').andCallThrough();

    render(moment([2026, 9, 27]), { id: 'evt', start: moment([2026, 9, 27]).unix() });
    expect(lastScroll().behavior).toBe('instant');
    expect(firstInView()).toBe('25Sun');
  });

  // Oct 11 to Oct 31 are drawn around Oct 18-24.
  it('sizes the All Day row for the all-day events drawn, not every event loaded', function () {
    const dayAfterDrawn = allDayOccurrence('day-after-drawn', '2026-11-01');
    const meeting = timedOccurrence('meeting', '2026-10-20T10:00', '2026-10-20T11:00');
    dataSource.buildObservable.andCallFake(() =>
      Rx.Observable.just({ events: [dayAfterDrawn, meeting] })
    );
    render(moment([2026, 9, 19]));

    expect(height('.date-label-legend')).toBe('76px');
    expect(height('.all-day-events')).toBe('0px');
  });

  it('sizes the All Day row for events on days drawn off-screen too', function () {
    const firstDrawn = allDayOccurrence('first-drawn', '2026-10-11');
    dataSource.buildObservable.andCallFake(() => Rx.Observable.just({ events: [firstDrawn] }));
    render(moment([2026, 9, 19]));

    expect(height('.date-label-legend')).toBe('98px');
    expect(height('.all-day-events')).toBe('22px');
  });

  it('requeries only once scrolling draws days past the three weeks queried either side', function () {
    render(moment([2026, 9, 21]));
    const queriedFrom = () =>
      calendarDateFromUnix(dataSource.buildObservable.mostRecentCall.args[0].startUnix);
    const firstQueried = queriedFrom();

    for (let day = 0; day < 21; day++) {
      scrollDays(1);
    }
    expect(dataSource.buildObservable.callCount).toBe(1);

    scrollDays(1);
    expect(dataSource.buildObservable.callCount).toBe(2);
    expect(calendarDaysBetween(firstQueried, queriedFrom())).toBe(22);
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
