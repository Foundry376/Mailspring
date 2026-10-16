import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import { act, cleanup, render } from '@testing-library/react';

import { MiniMonthView } from '../../src/components/mini-month-view';

describe('MiniMonthView', () => {
  afterEach(cleanup);

  it('moves the today marker across midnight while mounted', () => {
    let view: MiniMonthView | null = null;
    const { container } = render(
      <MiniMonthView ref={(instance) => (view = instance)} value={moment()} onChange={() => {}} />
    );
    const initialToday = view.state.today.clone();

    expect(container.querySelector('.day.today')?.textContent).toBe(initialToday.format('D'));

    act(() => view._refreshToday(initialToday.clone().add(1, 'day')));

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
    expect(host.querySelector('.week-scroller')).toBe(null);
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
});
