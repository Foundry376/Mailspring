import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import { AccountStore, DatabaseStore, DateUtils } from 'mailspring-exports';
import { EventPanel } from '../internal_packages/main-calendar/lib/core/event-panel';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import * as CalendarDateUtils from '../src/calendar-date';

const START = Date.UTC(2026, 10, 10, 15, 30, 0) / 1000;
const HOUR = 3600;

const invitation = (overrides: Partial<TimedOccurrence> = {}): TimedOccurrence =>
  ({
    id: 'e1-e0',
    accountId: 'a',
    calendarId: 'c',
    title: 'Design Review',
    location: '',
    description: '',
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: false,
    isMine: false,
    organizer: { email: 'ada@example.com' },
    attendees: [],
    start: START,
    end: START + HOUR,
    startDate: CalendarDateUtils.calendarDateFromUnix(START),
    endDate: CalendarDateUtils.calendarDateFromUnix(START),
    ...overrides,
  }) as TimedOccurrence;

describe('EventPanel', function () {
  let host: HTMLElement;

  beforeEach(function () {
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(null));
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  const render = (event: TimedOccurrence) =>
    ReactDOM.render(
      React.createElement(EventPanel, {
        event,
        isCalendarReadOnly: false,
        onBack: () => {},
        unsentChange: null,
        onUnsentChange: () => {},
        onSendUnsentChange: () => {},
        onSaveChange: () => Promise.resolve(),
      }),
      host
    );

  // As TimePicker and DatePicker show them in the panel of an event we organize.
  const pickerTime = (unix: number) => moment.unix(unix).format(DateUtils.localeTimeFormat());
  const pickerDay = (unix: number) =>
    moment.unix(unix).format(DateUtils.DATE_FORMAT_llll_NO_TIME).trim();

  it("shows an invitation's times and day as an event we organize shows them", function () {
    render(invitation());
    const text = host.querySelector('.event-panel-section').textContent;

    expect(text).toContain(pickerTime(START));
    expect(text).toContain(pickerTime(START + HOUR));
    expect(text).toContain(pickerDay(START));
  });

  it('shows both days of an invitation that spans two, as the date pickers do', function () {
    const end = START + 24 * HOUR;
    render(invitation({ end, endDate: CalendarDateUtils.calendarDateFromUnix(end) }));
    const text = host.querySelector('.event-panel-section').textContent;

    expect(text).toContain(`${pickerDay(START)}–${pickerDay(end)}`);
  });

  describe('on a meeting we were invited to', function () {
    const guests = [
      { email: 'ada@example.com', name: 'Ada', partstat: 'ACCEPTED' },
      { email: 'me@example.com', name: 'Me', partstat: 'NEEDS-ACTION' },
    ];

    beforeEach(function () {
      spyOn(AccountStore, 'accountForEmail').andCallFake((email: string) =>
        email === 'me@example.com' ? ({ id: 'a' } as any) : null
      );
    });

    const buttons = () => Array.from(host.querySelectorAll('button')).map((b) => b.textContent);

    it('offers the answers and a new time', function () {
      render(invitation({ attendees: guests }));

      expect(buttons()).toContain('Accept');
      expect(buttons()).toContain('Propose a new time...');
    });

    it('offers neither once the organizer cancels it, and says so', function () {
      render(invitation({ attendees: guests, isCancelled: true }));

      expect(buttons()).not.toContain('Accept');
      expect(buttons()).not.toContain('Propose a new time...');
      expect(host.textContent).toContain('This event has been cancelled');
    });
  });
});
