import React from 'react';
import moment from 'moment';
import 'moment/locale/de';
import 'moment/locale/lb';
import 'moment/locale/si';
import { render, fireEvent, cleanup } from '@testing-library/react';

import TimePicker from '../../src/components/time-picker';

// Requiring a locale file makes it the current one, so put the suite back where it was.
moment.locale('en');

// Clear of the 2026-03-08 transition, so a failed day assertion is a date bug, not a DST one.
const EVENT_DAY = '2026-03-10';
const VALUE = moment(`${EVENT_DAY} 15:00`, 'YYYY-MM-DD HH:mm').valueOf();

// The second 1:30 AM of a fall-back day, in the America/Chicago zone scripts/test.js pins.
// Re-parsing this field's own rendered text resolves the ambiguity to the earlier offset.
const REPEATED_HOUR_VALUE = Date.UTC(2026, 10, 1, 7, 30);

// An hour <= 7, so a 24-hour rendering of it ("05:30") is what _shouldAddTwelve reads as pm.
const MORNING_VALUE = moment(`${EVENT_DAY} 05:30`, 'YYYY-MM-DD HH:mm').valueOf();

describe('TimePicker', function timePicker() {
  afterEach(cleanup);

  function renderPicker(value = VALUE) {
    const onChange = jasmine.createSpy('onChange');
    const { container } = render(<TimePicker value={value} onChange={onChange} />);
    return { onChange, container, input: container.querySelector('input') as HTMLInputElement };
  }

  function lastEmitted(onChange: jasmine.Spy) {
    return moment(onChange.mostRecentCall.args[0]);
  }

  it('keeps the edited day when a new time is typed', () => {
    const { onChange, input } = renderPicker();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '4:30pm' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalled();
    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe(`${EVENT_DAY} 16:30`);
  });

  it('keeps the edited day when a bare hour is typed and read as pm', () => {
    const { onChange, input } = renderPicker();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);

    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe(`${EVENT_DAY} 16:00`);
  });

  // 1 through 7 are read as afternoon; 8 and later are taken as typed, so a morning meeting
  // does not need a meridiem. 0 is the one hour nobody writes to mean the afternoon.
  it('promotes a bare hour from one to seven only', () => {
    const typeBareHour = (hour: string) => {
      const { onChange, input } = renderPicker();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: hour } });
      fireEvent.blur(input);
      return lastEmitted(onChange).format('HH:mm');
    };

    expect(typeBareHour('0')).toBe('00:00');
    expect(typeBareHour('1')).toBe('13:00');
    expect(typeBareHour('7')).toBe('19:00');
    expect(typeBareHour('8')).toBe('08:00');
    expect(typeBareHour('12')).toBe('12:00');
  });

  it('stays silent when the field is focused and blurred with no edit', () => {
    const { onChange, input } = renderPicker();

    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stays silent on the repeated hour of a fall-back day', () => {
    const { onChange, input } = renderPicker(REPEATED_HOUR_VALUE);

    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('restores the canonical text when a typed time resolves to the value it already had', () => {
    const { onChange, input } = renderPicker();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe(moment(VALUE).format('LT'));
  });

  it('emits milliseconds from the arrow keys', () => {
    const { onChange, input } = renderPicker();

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe(`${EVENT_DAY} 15:30`);
  });

  // date-utils.ts runs moment.locale(navigator.language) at startup, so a German or Japanese
  // user's field renders and accepts 24-hour text.
  describe('in a 24-hour locale', () => {
    beforeEach(() => moment.locale('de'));
    afterEach(() => moment.locale('en'));

    it('stays silent when the field is focused and blurred with no edit', () => {
      const { onChange, input } = renderPicker(MORNING_VALUE);

      fireEvent.focus(input);
      fireEvent.blur(input);

      expect(input.value).toBe('05:30');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('reads a typed HH:mm as the hour that was typed', () => {
      const { onChange, input } = renderPicker();

      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '06:30' } });
      fireEvent.blur(input);

      expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe(`${EVENT_DAY} 06:30`);
    });

    it('reads a bare hour as the hour that was typed', () => {
      const { onChange, input } = renderPicker();

      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.blur(input);

      expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe(`${EVENT_DAY} 05:00`);
    });
  });

  // A meridiem test would get both of these wrong: lb is 24-hour but its LT carries a
  // bracketed "Auer", and si is 12-hour with a lowercase marker.
  describe('picking the clock a locale uses', () => {
    afterEach(() => moment.locale('en'));

    const typeBareFive = () => {
      const { onChange, input } = renderPicker();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.blur(input);
      return lastEmitted(onChange).format('HH:mm');
    };

    it('reads the hour token rather than the meridiem', () => {
      moment.locale('lb');
      expect(typeBareFive()).toBe('05:00');

      moment.locale('si');
      expect(typeBareFive()).toBe('17:00');
    });
  });

  it('emits milliseconds from the dropdown', () => {
    const { onChange, input, container } = renderPicker();

    fireEvent.focus(input);
    fireEvent.mouseDown(container.querySelector('.time-options .option') as HTMLElement);

    expect(lastEmitted(onChange).format('YYYY-MM-DD HH:mm')).toBe(`${EVENT_DAY} 00:00`);
  });
});
