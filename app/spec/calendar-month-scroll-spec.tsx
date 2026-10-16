import React from 'react';
import ReactDOM from 'react-dom';
import moment, { Moment } from 'moment';
import Rx from 'rx-lite';

import { MonthView } from '../internal_packages/main-calendar/lib/core/month-view';

describe('MonthView scrolling', function () {
  const dataSource = { buildObservable: () => Rx.Observable.just({ events: [] }) };
  let host: HTMLDivElement;
  let onChangeFocusedMoment: jasmine.Spy;

  const render = (focusedMoment: Moment, focusedEvent: any = null) => {
    ReactDOM.render(
      <MonthView
        {...({
          dataSource,
          disabledCalendars: [],
          focusedMoment,
          focusedEvent,
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

  const grid = () => host.querySelector('.month-view-grid') as HTMLElement;
  const rowHeight = () => grid().clientHeight / 6;
  const title = () => host.querySelector('.header-controls .title').textContent;

  beforeEach(function () {
    onChangeFocusedMoment = jasmine.createSpy('onChangeFocusedMoment');
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
    const octoberTop = grid().scrollTop;
    expect(title()).toBe('October 2026');

    // Four weeks on from Sun 27 Sep, the rows run 25 Oct to 5 Dec: mostly November, but not
    // November's first week at the top, which is where scrolling back to it would go.
    grid().scrollTop = octoberTop + 4 * rowHeight();
    grid().dispatchEvent(new Event('scroll'));
    grid().dispatchEvent(new Event('scrollend'));
    expect(title()).toBe('November 2026');
    const followed = onChangeFocusedMoment.mostRecentCall.args[0] as Moment;
    expect(followed.format('YYYY-MM-DD')).toBe('2026-11-16');

    spyOn(grid(), 'scrollTo').andCallThrough();
    render(followed);
    expect(grid().scrollTo).not.toHaveBeenCalled();
  });

  it('jumps rather than glides to the month of an event it reveals', function () {
    render(moment([2026, 9, 16]));
    const octoberTop = grid().scrollTop;

    // A glide would still be at October here; the card opens where the event is now.
    render(moment([2026, 10, 3]), { id: 'evt', start: moment([2026, 10, 3]).unix() });
    expect(grid().scrollTop).toBe(octoberTop + 5 * rowHeight());
    expect(title()).toBe('November 2026');
  });
});
