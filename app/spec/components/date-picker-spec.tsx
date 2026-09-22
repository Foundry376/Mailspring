import React from 'react';
import moment from 'moment';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { DatePicker } from '../../src/components/date-picker';

// MiniMonthView tags each cell with local midnight of that day, so what the picker does with
// the clock time of the value it was given is the whole question here.
const EVENT_DAY = '2026-03-10';
const TARGET_DAY = '2026-03-17';
const VALUE = moment(`${EVENT_DAY} 15:00`, 'YYYY-MM-DD HH:mm').valueOf();

// 1:30 AM happens twice on 2026-11-01 in the zone scripts/test.js pins: 06:30Z at -05:00, then
// 07:30Z at -06:00. Picking a day says nothing about which, so this pins the same answer
// secondsIntoDayUnix gives — the first.
const AMBIGUOUS_VALUE = moment('2026-10-20 01:30', 'YYYY-MM-DD HH:mm').valueOf();
const FALL_BACK_DAY = '2026-11-01';

describe('DatePicker', function datePicker() {
  afterEach(cleanup);

  function renderPicker() {
    const onChange = jasmine.createSpy('onChange');
    const { container } = render(<DatePicker value={VALUE} onChange={onChange} />);
    return { onChange, picker: container.querySelector('.date-picker') as HTMLElement, container };
  }

  function lastEmitted(onChange: jasmine.Spy) {
    return moment(onChange.mostRecentCall.args[0]);
  }

  it('keeps the clock time when a day is picked from the mini month', () => {
    const { onChange, picker, container } = renderPicker();

    fireEvent.focus(picker);
    const unix = moment(`${TARGET_DAY} 00:00`, 'YYYY-MM-DD HH:mm').valueOf();
    fireEvent.click(container.querySelector(`.day[data-unix="${unix}"]`) as HTMLElement);

    expect(onChange).toHaveBeenCalled();
    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe(`${TARGET_DAY} 15:00`);
  });

  it('lands on the first of two identical wall clocks when the day repeats an hour', () => {
    const onChange = jasmine.createSpy('onChange');
    const { container } = render(<DatePicker value={AMBIGUOUS_VALUE} onChange={onChange} />);

    fireEvent.focus(container.querySelector('.date-picker') as HTMLElement);
    const unix = moment(`${FALL_BACK_DAY} 00:00`, 'YYYY-MM-DD HH:mm').valueOf();
    fireEvent.click(container.querySelector(`.day[data-unix="${unix}"]`) as HTMLElement);

    expect(lastEmitted(onChange).valueOf()).toBe(Date.UTC(2026, 10, 1, 6, 30));
  });

  it('keeps the clock time when an arrow key moves the day', () => {
    const { onChange, picker } = renderPicker();

    fireEvent.keyDown(picker, { key: 'ArrowRight' });

    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe('2026-03-11 15:00');
  });
});
