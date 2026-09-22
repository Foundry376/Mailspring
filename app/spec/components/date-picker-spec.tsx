import React from 'react';
import moment from 'moment';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { DatePicker } from '../../src/components/date-picker';

const EVENT_DAY = '2026-03-10';
const VALUE = moment(`${EVENT_DAY} 15:00`, 'YYYY-MM-DD HH:mm').valueOf();

// 02:30 exists on this date but not on 2027-03-14, so a transplant that moves the value's own
// date into the target year before moving the day passes through that gap and gains an hour.
const GAP_ANNIVERSARY_VALUE = moment('2026-03-14 02:30', 'YYYY-MM-DD HH:mm').valueOf();

describe('DatePicker', function datePicker() {
  afterEach(cleanup);

  function renderPicker(value = VALUE) {
    const onChange = jasmine.createSpy('onChange');
    const { container } = render(<DatePicker value={value} onChange={onChange} />);
    return { onChange, container, picker: container.querySelector('.date-picker') as HTMLElement };
  }

  // Opens the mini month, walks it to the target's month, and clicks that day's cell — the
  // cells are keyed by local midnight (mini-month-view.tsx:95).
  function pickDay(container: HTMLElement, picker: HTMLElement, target: string) {
    fireEvent.focus(picker);
    const day = moment(`${target} 00:00`, 'YYYY-MM-DD HH:mm');
    const shown = () => moment(container.querySelector('.month-title').textContent, 'MMMM YYYY');
    const [prev, next] = Array.from(container.querySelectorAll('.btn-icon'));
    while (!shown().isSame(day, 'month')) {
      fireEvent.click(shown().isBefore(day) ? next : prev);
    }
    fireEvent.click(container.querySelector(`.day[data-unix="${day.valueOf()}"]`) as HTMLElement);
  }

  function lastEmitted(onChange: jasmine.Spy) {
    return moment(onChange.mostRecentCall.args[0]);
  }

  it('keeps the clock time when a day is picked from the mini month', () => {
    const { onChange, container, picker } = renderPicker();

    pickDay(container, picker, '2026-03-17');

    expect(onChange).toHaveBeenCalled();
    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe('2026-03-17 15:00');
  });

  it('keeps the clock time across a daylight-saving change', () => {
    const { onChange, container, picker } = renderPicker();

    pickDay(container, picker, '2026-11-01');

    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe('2026-11-01 15:00');
  });

  it('keeps the clock time when the destination is itself a spring-forward day', () => {
    const { onChange, container, picker } = renderPicker();

    pickDay(container, picker, '2026-03-08');

    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe('2026-03-08 15:00');
  });

  it('keeps the clock time when the value’s own date is a gap day in the target year', () => {
    const { onChange, container, picker } = renderPicker(GAP_ANNIVERSARY_VALUE);

    pickDay(container, picker, '2027-06-01');

    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe('2027-06-01 02:30');
  });

  it('lands on the first of two identical wall clocks when the day repeats an hour', () => {
    const value = moment('2026-10-20 01:30', 'YYYY-MM-DD HH:mm').valueOf();
    const { onChange, container, picker } = renderPicker(value);

    pickDay(container, picker, '2026-11-01');

    expect(lastEmitted(onChange).valueOf()).toBe(Date.UTC(2026, 10, 1, 6, 30));
  });

  it('keeps the clock time when an arrow key moves the day', () => {
    const { onChange, picker } = renderPicker();

    fireEvent.keyDown(picker, { key: 'ArrowRight' });

    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe('2026-03-11 15:00');
  });
});
