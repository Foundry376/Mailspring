import React from 'react';
import moment from 'moment';
import { render, fireEvent, cleanup } from '@testing-library/react';

import TimePicker from '../../src/components/time-picker';

// The field renders `value` as a time-only string ("3:00 PM") and re-parses that string on
// blur, so these assertions read the calendar day of the instant it emits: the clock time
// survives that round trip on its own, the date is what needs carrying across.
const EVENT_DAY = '2026-03-10';
const VALUE = moment(`${EVENT_DAY} 15:00`, 'YYYY-MM-DD HH:mm').valueOf();

describe('TimePicker', function timePicker() {
  afterEach(cleanup);

  function renderPicker() {
    const onChange = jasmine.createSpy('onChange');
    const { container } = render(<TimePicker value={VALUE} onChange={onChange} />);
    return { onChange, input: container.querySelector('input') as HTMLInputElement };
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

  it('stays silent when the field is focused and blurred with no edit', () => {
    const { onChange, input } = renderPicker();

    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
  });
});
