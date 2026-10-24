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

describe('MiniMonthView header', () => {
  let host: HTMLDivElement;
  let observed: { callback: () => void; target: Element }[];
  let RealResizeObserver: typeof ResizeObserver;

  // A hidden spec window reports resizes irregularly, so this one reports when the spec says so.
  class FakeResizeObserver {
    constructor(public callback: () => void) {}
    observe(target: Element) {
      observed.push({ callback: this.callback, target });
    }
    disconnect() {
      observed = observed.filter((o) => o.callback !== this.callback);
    }
  }

  const title = () => host.querySelector('.month-title').textContent;
  const arrowsIn = () => Array.from(host.querySelectorAll<HTMLElement>('.header button'));

  beforeEach(() => {
    observed = [];
    RealResizeObserver = window.ResizeObserver;
    (window as any).ResizeObserver = FakeResizeObserver;
    host = document.createElement('div');
    host.style.width = '250px';
    document.body.appendChild(host);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
    window.ResizeObserver = RealResizeObserver;
  });

  it('puts the title before both arrows', () => {
    ReactDOM.render(<MiniMonthView value={moment([2026, 9, 16])} onChange={() => {}} />, host);
    const header = host.querySelector('.header');
    expect(header.firstElementChild.className).toBe('month-title');
    expect(header.querySelectorAll('.month-title ~ button').length).toBe(2);
  });

  it('pages a month at a time with labelled arrows that point the way they are asked to', () => {
    for (const arrows of ['horizontal', 'vertical'] as const) {
      ReactDOM.render(
        <MiniMonthView arrows={arrows} value={moment([2026, 9, 16])} onChange={() => {}} />,
        host
      );
      const [previous, next] = arrowsIn();
      expect([previous, next].map((a) => a.getAttribute('aria-label'))).toEqual([
        'Previous',
        'Next',
      ]);
      const chevron = next.querySelector('svg');
      const wide = Number(chevron.getAttribute('width')) > Number(chevron.getAttribute('height'));
      expect(wide).toBe(arrows === 'vertical');

      next.click();
      expect(title()).toBe('November 2026');
      previous.click();
      previous.click();
      expect(title()).toBe('September 2026');
      ReactDOM.unmountComponentAtNode(host);
    }
  });

  // The date picker shows the month only while it holds focus, so an arrow taking focus closes it.
  it('never takes focus from a click or Tab', () => {
    ReactDOM.render(<MiniMonthView value={moment([2026, 9, 16])} onChange={() => {}} />, host);
    for (const arrow of arrowsIn()) {
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

  // The app flips its stylesheets for right-to-left languages, but not inline positions.
  it('shades the days in view, one band per row, under the right days in right-to-left layouts', () => {
    host.dir = 'rtl';
    const first = CalendarDates.calendarDateFromParts(2026, 10, 22);
    ReactDOM.render(
      <MiniMonthView
        value={moment([2026, 9, 16])}
        visibleRange={{ first, days: 7 }}
        onChange={() => {}}
      />,
      host
    );
    const span = (labels: string[]) => {
      const cells = Array.from(host.querySelectorAll('.day.cur-month'))
        .filter((d) => labels.includes(d.textContent))
        .map((d) => d.getBoundingClientRect());
      return [Math.min(...cells.map((r) => r.left)), Math.max(...cells.map((r) => r.right))];
    };
    const bands = Array.from(host.querySelectorAll('.visible-range')).map((b) => {
      const r = b.getBoundingClientRect();
      return [r.left, r.right];
    });

    // Thu Oct 22 to Wed Oct 28 wraps from one week's row onto the next.
    expect(bands.length).toBe(2);
    for (const [band, cells] of [
      [bands[0], span(['22', '23', '24'])],
      [bands[1], span(['25', '26', '27', '28'])],
    ]) {
      expect(Math.abs(band[0] - cells[0])).toBeLessThan(1);
      expect(Math.abs(band[1] - cells[1])).toBeLessThan(1);
    }
  });

  it('shortens the month name while the full title would not fit, as it resizes or pages', () => {
    ReactDOM.render(<MiniMonthView value={moment([2026, 8, 16])} onChange={() => {}} />, host);
    const titleEl = host.querySelector('.month-title');
    // 10px a character, in a 100px title.
    Object.defineProperty(titleEl, 'clientWidth', { value: 100 });
    Object.defineProperty(host.querySelector('.month-title-measure'), 'offsetWidth', {
      get() {
        return this.textContent.length * 10;
      },
    });
    for (const o of observed.filter((entry) => entry.target === titleEl)) o.callback();
    expect(title()).toBe('Sep 2026');

    const [previous] = arrowsIn();
    previous.click();
    expect(title()).toBe('Aug 2026');
    previous.click();
    expect(title()).toBe('July 2026');
  });
});
