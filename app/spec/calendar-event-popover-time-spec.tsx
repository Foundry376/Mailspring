import React from 'react';
import moment from 'moment';
import { render, fireEvent, cleanup } from '@testing-library/react';

import TimePicker from '../src/components/time-picker';
import { CalendarEventPopover } from '../internal_packages/main-calendar/lib/core/calendar-event-popover';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const EVENT_DAY = '2026-03-10';
const START = moment(`${EVENT_DAY} 15:00`, 'YYYY-MM-DD HH:mm').unix();
const END = moment(`${EVENT_DAY} 16:00`, 'YYYY-MM-DD HH:mm').unix();

function makeOccurrence(): TimedOccurrence {
  return {
    id: 'event-1-e0',
    accountId: 'account-1',
    calendarId: 'calendar-1',
    title: 'Planning',
    location: '',
    description: '',
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: false,
    organizer: null,
    attendees: [],
    start: START,
    end: END,
  } as TimedOccurrence;
}

// The popover wires both time fields to updateStart/updateEnd, and updateStart carries the end
// along to preserve the duration. Driving the real pair together is what makes these assert the
// outcome — neither date moves — instead of the instant a picker happens to emit.
function renderTimeFields() {
  const popover: any = new CalendarEventPopover({
    event: makeOccurrence(),
    onEdit: () => {},
    onDelete: () => {},
  } as any);
  popover.setState = (update: object) => Object.assign(popover.state, update);

  const { container } = render(
    <div>
      <TimePicker
        value={popover.state.start * 1000}
        onChange={(ts) => popover.updateStart(ts / 1000)}
      />
      <TimePicker
        value={popover.state.end * 1000}
        onChange={(ts) => popover.updateEnd(ts / 1000)}
      />
    </div>
  );

  const [startInput, endInput] = Array.from(container.querySelectorAll('input'));
  return { popover, startInput, endInput };
}

function dayAndTime(unix: number) {
  return moment.unix(unix).format('YYYY-MM-DD HH:mm');
}

describe('CalendarEventPopover time fields', function () {
  afterEach(cleanup);

  it('leaves both dates alone when the start time is focused and left untouched', () => {
    const { popover, startInput } = renderTimeFields();

    fireEvent.focus(startInput);
    fireEvent.blur(startInput);

    expect(dayAndTime(popover.state.start)).toBe(`${EVENT_DAY} 15:00`);
    expect(dayAndTime(popover.state.end)).toBe(`${EVENT_DAY} 16:00`);
  });

  it('leaves both dates alone when the end time is focused and left untouched', () => {
    const { popover, endInput } = renderTimeFields();

    fireEvent.focus(endInput);
    fireEvent.blur(endInput);

    expect(dayAndTime(popover.state.start)).toBe(`${EVENT_DAY} 15:00`);
    expect(dayAndTime(popover.state.end)).toBe(`${EVENT_DAY} 16:00`);
  });

  it('still carries the end along when the start time is genuinely edited', () => {
    const { popover, startInput } = renderTimeFields();

    fireEvent.focus(startInput);
    fireEvent.change(startInput, { target: { value: '5:00pm' } });
    fireEvent.blur(startInput);

    expect(dayAndTime(popover.state.start)).toBe(`${EVENT_DAY} 17:00`);
    expect(dayAndTime(popover.state.end)).toBe(`${EVENT_DAY} 18:00`);
  });
});
