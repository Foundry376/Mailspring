import React from 'react';
import ReactDOM from 'react-dom';
import moment, { Moment } from 'moment';
import Rx from 'rx-lite';

import { MonthView } from '../internal_packages/main-calendar/lib/core/month-view';
import CalendarHeaderStore from '../internal_packages/main-calendar/lib/core/calendar-header-store';
import { EventOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { calendarDateFromUnix, calendarDaysBetween } from '../src/calendar-date';
import { allDayOccurrence, calendarViewProps } from './fixtures/calendar-view-props';

const NO_CALENDARS: string[] = [];

describe('MonthView scrolling', function () {
  let events: EventOccurrence[];
  let dataSource: { buildObservable: jasmine.Spy };
  let host: HTMLDivElement;
  let onChangeFocusedMoment: jasmine.Spy;

  const render = (focusedMoment: Moment, focusedEvent = null, disabledCalendars = NO_CALENDARS) => {
    ReactDOM.render(
      <MonthView
        {...calendarViewProps({
          dataSource: dataSource as any,
          disabledCalendars,
          focusedMoment,
          focusedEvent,
          onChangeFocusedMoment,
        })}
      />,
      host
    );
  };

  const grid = () => host.querySelector('.month-view-grid') as HTMLElement;
  const rowHeight = () => grid().clientHeight / 6;
  const title = () => CalendarHeaderStore.viewHeader().title;
  const barOf = (eventTitle: string) =>
    Array.from(host.querySelectorAll<HTMLElement>('.month-view-event')).find(
      (bar) => bar.textContent === eventTitle
    );
  const scrollRows = (rows: number) => {
    grid().scrollTop += rows * rowHeight();
    grid().dispatchEvent(new Event('scroll'));
  };

  beforeEach(function () {
    events = [];
    dataSource = {
      buildObservable: jasmine
        .createSpy('buildObservable')
        .andCallFake(() => Rx.Observable.just({ events })),
    };
    // Re-renders inside the call, as FocusedMomentStore's synchronous trigger does in the app.
    onChangeFocusedMoment = jasmine.createSpy('onChangeFocusedMoment').andCallFake(render);
    host = document.createElement('div');
    host.style.width = '700px';
    document.body.appendChild(host);
    // Specs load core styles but not the calendar package's, which size the grid in the app.
    const style = document.createElement('style');
    style.id = 'month-scroll-spec';
    style.textContent = '.month-view-grid { height: 600px; }';
    document.head.appendChild(style);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    document.getElementById('month-scroll-spec').remove();
  });

  it('moves the focused date into the month scrolled to, and does not scroll back for it', function () {
    render(moment([2026, 9, 16]));
    expect(title()).toBe('October 2026');
    spyOn(grid(), 'scrollTo').andCallThrough();

    // Four weeks on from Sun 27 Sep, the rows run 25 Oct to 5 Dec: mostly November, but not
    // November's first week at the top, which is where scrolling back to it would go.
    scrollRows(4);
    grid().dispatchEvent(new Event('scrollend'));

    expect(title()).toBe('November 2026');
    const followed = onChangeFocusedMoment.mostRecentCall.args[0] as Moment;
    expect(followed.format('YYYY-MM-DD')).toBe('2026-11-16');
    expect(grid().scrollTo).not.toHaveBeenCalled();
  });

  it('jumps rather than glides to the month of an event it reveals', function () {
    render(moment([2026, 9, 16]));
    const octoberTop = grid().scrollTop;

    // A glide would still be at October here.
    render(moment([2026, 10, 3]), { id: 'evt', start: moment([2026, 10, 3]).unix() });
    expect(grid().scrollTop).toBe(octoberTop + 5 * rowHeight());
    expect(title()).toBe('November 2026');
  });

  it('gives Tab only to events in the rows in view', function () {
    // October 2026 shows from Sun 27 Sep; the rows drawn above it start Sun 16 Aug.
    events = [allDayOccurrence('above', '2026-08-20'), allDayOccurrence('shown', '2026-10-14')];
    render(moment([2026, 9, 16]));

    expect(barOf('above').tabIndex).toBe(-1);
    expect(barOf('shown').tabIndex).toBe(0);
  });

  it('finds an event by id at its first bar in view, which a card opens beside', function () {
    // From Sun 20 Sep, the event's first bar is in a row drawn above October's first week.
    events = [allDayOccurrence('trip', '2026-09-20', '2026-10-03')];
    render(moment([2026, 9, 16]));

    const anchorRow = document.getElementById('trip').closest('.month-view-week');
    expect(anchorRow.getBoundingClientRect().top).not.toBeLessThan(
      grid().getBoundingClientRect().top - 1
    );
  });

  it('requeries once scrolling draws weeks outside the last query, and when calendars change', function () {
    const october = moment([2026, 9, 16]);
    render(october);
    const firstQuery = dataSource.buildObservable.mostRecentCall.args[0];
    const queriedFrom = (query) => calendarDateFromUnix(query.startUnix);

    scrollRows(3);
    expect(dataSource.buildObservable.callCount).toBe(1);

    scrollRows(4);
    expect(dataSource.buildObservable.callCount).toBe(2);
    const secondQuery = dataSource.buildObservable.mostRecentCall.args[0];
    expect(calendarDaysBetween(queriedFrom(firstQuery), queriedFrom(secondQuery))).toBe(49);

    render(october, null, ['cal-2']);
    expect(dataSource.buildObservable.callCount).toBe(3);
    expect(dataSource.buildObservable.mostRecentCall.args[0].disabledCalendars).toEqual(['cal-2']);
  });
});
