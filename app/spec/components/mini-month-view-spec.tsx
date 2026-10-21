import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

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

describe('MiniMonthView paging', () => {
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

  it('pages a month at a time with its labelled arrows, whichever way they point', () => {
    for (const arrows of ['horizontal', 'vertical'] as const) {
      ReactDOM.render(
        <MiniMonthView arrows={arrows} value={moment([2026, 9, 16])} onChange={() => {}} />,
        host
      );
      const [previous, next] = Array.from(host.querySelectorAll('.header button'));
      expect(previous.getAttribute('aria-label')).toBe('Previous');
      (next as HTMLElement).click();
      expect(title()).toBe('November 2026');
      (previous as HTMLElement).click();
      (previous as HTMLElement).click();
      expect(title()).toBe('September 2026');
      ReactDOM.unmountComponentAtNode(host);
    }
  });

  // The date picker shows the month only while it holds focus, so an arrow taking focus closes it.
  it('never takes focus from a click or Tab', () => {
    ReactDOM.render(<MiniMonthView value={moment([2026, 9, 16])} onChange={() => {}} />, host);
    for (const arrow of Array.from(host.querySelectorAll<HTMLElement>('.header button'))) {
      expect(arrow.tabIndex).toBe(-1);
      expect(fireEvent.mouseDown(arrow)).toBe(false);
    }
  });

  it('shows the month of a new value', () => {
    const onChange = () => {};
    ReactDOM.render(<MiniMonthView value={moment([2026, 9, 16])} onChange={onChange} />, host);
    ReactDOM.render(<MiniMonthView value={moment([2028, 2, 10])} onChange={onChange} />, host);
    expect(title()).toBe('March 2028');
    expect(host.querySelector('.cur-day').textContent).toBe('10');
  });

  it('moves the today marker when its value changes', () => {
    let view: MiniMonthView = null;
    const renderWith = (value) =>
      ReactDOM.render(
        <MiniMonthView ref={(v) => (view = v)} value={value} onChange={() => {}} />,
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
  let view: MiniMonthView = null;

  const title = () => host.querySelector('.month-title').textContent;

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
    expect(header.querySelectorAll('.month-title ~ button').length).toBe(2);
  });

  it('shortens the month name while the full title would not fit, rechecking as months change', () => {
    ReactDOM.render(
      <MiniMonthView ref={(v) => (view = v)} value={moment([2026, 8, 16])} onChange={() => {}} />,
      host
    );
    // 10px a character, in a 100px title.
    Object.defineProperty(host.querySelector('.month-title'), 'clientWidth', { value: 100 });
    Object.defineProperty(host.querySelector('.month-title-measure'), 'offsetWidth', {
      get() {
        return this.textContent.length * 10;
      },
    });
    view._fitTitle();
    expect(title()).toBe('Sep 2026');

    const previous = host.querySelectorAll('.header button')[0] as HTMLElement;
    previous.click();
    expect(title()).toBe('Aug 2026');
    previous.click();
    expect(title()).toBe('July 2026');
  });
});
