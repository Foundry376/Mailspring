import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import { act, cleanup, render } from '@testing-library/react';

import { MiniMonthView } from '../../src/components/mini-month-view';
import * as CalendarDates from '../../src/calendar-date';

describe('MiniMonthView', () => {
  afterEach(cleanup);

  it('moves the today marker across midnight while mounted', () => {
    let dayChanged: (today: CalendarDates.CalendarDate) => void;
    spyOn(CalendarDates, 'onDayChange').andCallFake((_today, onChange) => {
      dayChanged = onChange;
      return { dispose() {} };
    });
    const { container } = render(<MiniMonthView value={moment()} onChange={() => {}} />);
    const initialToday = moment().startOf('day');

    expect(container.querySelector('.day.today')?.textContent).toBe(initialToday.format('D'));

    act(() =>
      dayChanged(CalendarDates.calendarDateFromUnix(initialToday.clone().add(1, 'day').unix()))
    );

    expect(container.querySelector('.day.today')?.textContent).toBe(
      initialToday.clone().add(1, 'day').format('D')
    );
    expect(container.querySelectorAll('.day.today').length).toBe(1);
  });
});

describe('MiniMonthView orientation', () => {
  let host: HTMLDivElement;

  const title = () => host.querySelector('.month-title').textContent;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '250px';
    document.body.appendChild(host);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  it('pages a month at a time unless asked to scroll', () => {
    ReactDOM.render(<MiniMonthView value={moment([2026, 9, 16])} onChange={() => {}} />, host);
    expect(host.querySelector('.snap-scroller')).toBe(null);
    (host.querySelectorAll('.header .btn')[1] as HTMLElement).click();
    expect(title()).toBe('November 2026');
  });

  it('scrolls vertically, naming the month in the middle of its rows', () => {
    ReactDOM.render(
      <MiniMonthView orientation="vertical" value={moment([2026, 9, 16])} onChange={() => {}} />,
      host
    );
    const grid = host.querySelector('.day-grid') as HTMLElement;
    expect(grid.clientHeight).toBeGreaterThan(0);
    expect(title()).toBe('October 2026');

    // Rows from Sun 27 Sep: three weeks on, the middle day is 8 Nov.
    grid.scrollTop += 3 * (grid.clientHeight / 6);
    grid.dispatchEvent(new Event('scroll'));
    expect(title()).toBe('November 2026');
  });

  it('scrolls to the month of a new value', () => {
    const onChange = () => {};
    ReactDOM.render(
      <MiniMonthView orientation="vertical" value={moment([2026, 9, 16])} onChange={onChange} />,
      host
    );
    ReactDOM.render(
      <MiniMonthView orientation="vertical" value={moment([2028, 2, 10])} onChange={onChange} />,
      host
    );
    expect(title()).toBe('March 2028');
    expect(host.querySelector('.cur-day').textContent).toBe('10');
  });

  it('steps from where a glide is headed when its arrow is clicked again on the way', () => {
    ReactDOM.render(
      <MiniMonthView orientation="vertical" value={moment([2026, 9, 16])} onChange={() => {}} />,
      host
    );
    const grid = host.querySelector('.day-grid') as HTMLElement;
    const octoberTop = grid.scrollTop;
    spyOn(grid, 'scrollTo').andCallThrough();
    const down = host.querySelectorAll('.header .btn')[1] as HTMLElement;
    down.click();
    down.click();

    // December's first week starts Sun 29 Nov, nine weeks on from Sun 27 Sep.
    const { top } = (grid.scrollTo as jasmine.Spy).mostRecentCall.args[0];
    expect(top).toBe(octoberTop + 9 * (grid.clientHeight / 6));
  });

  it('steps from the month a new value heads back to, while an earlier glide is on its way', () => {
    const renderWith = (value) =>
      ReactDOM.render(
        <MiniMonthView orientation="vertical" value={value} onChange={() => {}} />,
        host
      );
    renderWith(moment([2026, 9, 16]));
    const grid = host.querySelector('.day-grid') as HTMLElement;
    const octoberTop = grid.scrollTop;
    spyOn(grid, 'scrollTo').andCallThrough();
    const down = host.querySelectorAll('.header .btn')[1] as HTMLElement;
    down.click();
    renderWith(moment([2026, 9, 20]));
    down.click();

    // November's first week starts Sun 1 Nov, five weeks on from Sun 27 Sep.
    const { top } = (grid.scrollTo as jasmine.Spy).mostRecentCall.args[0];
    expect(top).toBe(octoberTop + 5 * (grid.clientHeight / 6));
  });

  it('moves the today marker when its value changes', () => {
    let view: MiniMonthView = null;
    const renderWith = (value) =>
      ReactDOM.render(
        <MiniMonthView
          ref={(v) => (view = v)}
          orientation="vertical"
          value={value}
          onChange={() => {}}
        />,
        host
      );
    renderWith(moment([2026, 9, 16]));
    view.setState({ today: moment().subtract(1, 'day').startOf('day') });
    renderWith(moment([2026, 9, 20]));
    expect(view.state.today.isSame(moment(), 'day')).toBe(true);
  });
});

describe('MiniMonthView header', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  it('puts the title before both arrows', () => {
    ReactDOM.render(<MiniMonthView value={moment([2026, 9, 16])} onChange={() => {}} />, host);
    const header = host.querySelector('.header');
    expect(header.firstElementChild.className).toBe('month-title');
    expect(header.querySelectorAll('.month-title ~ .btn').length).toBe(2);
  });
});
