import React from 'react';
import ReactDOM from 'react-dom';
import { fireEvent } from '@testing-library/react';
import momentTz from 'moment-timezone';
import { Actions, DatabaseStore, Event, SyncbackEventTask } from 'mailspring-exports';
import { EventPanel } from '../internal_packages/main-calendar/lib/core/event-panel';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import {
  newEventOccurrence,
  queueNewCalendarEvent,
  sameWallClockIn,
} from '../internal_packages/main-calendar/lib/core/calendar-helpers';
import {
  modifyEventChange,
  modifySeriesChange,
} from '../internal_packages/main-calendar/lib/core/recurring-event-actions';
import {
  newEventOptions,
  scopesFor,
  withTimes,
} from '../internal_packages/main-calendar/lib/core/unsent-change';
import { formatTimezone } from '../internal_packages/main-calendar/lib/core/timezone-selector';
import * as CalendarDateUtils from '../src/calendar-date';

const HOUR = 3600;
const at = (wall: string, zone: string) => momentTz.tz(wall, zone).unix();

const icsOf = (vevents: string) => `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
${vevents}
END:VCALENDAR`;

const oneOff = (zone: string, start: string, end: string) =>
  icsOf(`BEGIN:VEVENT
UID:zone@test
DTSTART;TZID=${zone}:${start}
DTEND;TZID=${zone}:${end}
SUMMARY:Planning
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT`);

const rowFor = (ics: string) =>
  new Event({ id: 'e1', accountId: 'a', calendarId: 'c', ics, icsuid: 'zone@test' } as any);

const ours = (start: number, end: number): TimedOccurrence =>
  ({
    id: 'e1',
    accountId: 'a',
    calendarId: 'c',
    title: 'Planning',
    location: '',
    description: '',
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: false,
    isMine: true,
    organizer: null,
    attendees: [],
    start,
    end,
    startDate: CalendarDateUtils.calendarDateFromUnix(start),
    endDate: CalendarDateUtils.calendarDateFromUnix(end),
  }) as TimedOccurrence;

describe("an event's own time zone", function () {
  let host: HTMLElement;
  let onSaveChange: jasmine.Spy;
  let onUnsentChange: jasmine.Spy;

  beforeEach(function () {
    host = document.createElement('div');
    document.body.appendChild(host);
    onSaveChange = jasmine.createSpy('onSaveChange').andReturn(Promise.resolve());
    onUnsentChange = jasmine.createSpy('onUnsentChange');
    spyOn(Actions, 'queueTask');
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => opts);
  });

  afterEach(function () {
    ReactDOM.unmountComponentAtNode(host);
    host.remove();
  });

  const render = async (event: TimedOccurrence, row: Event | null, isNewEvent = false) => {
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(row));
    const panel = ReactDOM.render(
      React.createElement(EventPanel, {
        event,
        isNewEvent,
        isCalendarReadOnly: false,
        onBack: () => {},
        unsentChange: null,
        onUnsentChange,
        onSendUnsentChange: () => {},
        onSaveChange,
      }),
      host
    ) as any;
    await panel._loadEventRow();
    return panel;
  };

  const pickZone = (zone: string) =>
    fireEvent.change(host.querySelector('select[aria-label="Time zone"]'), {
      target: { value: zone },
    });

  it('moves a one-off to the zone picked, at the wall clock it showed', async function () {
    // Neither zone is the spec machine's, which the wall clock must not be read in.
    const row = rowFor(oneOff('Asia/Tokyo', '20261111T093000', '20261111T103000'));
    const start = at('2026-11-11T09:30', 'Asia/Tokyo');
    const panel = await render(ours(start, start + HOUR), row);

    pickZone('Europe/London');
    await panel._saving;
    modifyEventChange(row, onSaveChange.calls[0].args[0], 'this-occurrence');

    expect(row.ics).toContain('DTSTART;TZID=Europe/London:20261111T093000');
    expect(row.ics).toContain('DTEND;TZID=Europe/London:20261111T103000');
    expect(row.ics).not.toContain('Asia/Tokyo');
  });

  it("reads the times in the event's zone, and saves an edit at that zone's wall clock", async function () {
    const row = rowFor(oneOff('Asia/Tokyo', '20261111T093000', '20261111T103000'));
    const start = at('2026-11-11T09:30', 'Asia/Tokyo');
    const panel = await render(ours(start, start + HOUR), row);
    const [startField] = Array.from(
      host.querySelectorAll<HTMLInputElement>('.time-picker-wrap input')
    );

    expect(startField.value).toBe('9:30AM');
    expect(host.textContent).toContain('Tue, Nov 10, 6:30\u2009–\u20097:30PM your time');

    fireEvent.change(startField, { target: { value: '10:00am' } });
    fireEvent.blur(startField);
    await panel._saving;
    const change = onSaveChange.calls[0].args[0];
    modifyEventChange(row, change, 'this-occurrence');

    expect(change.times.start).toBe(at('2026-11-11T10:00', 'Asia/Tokyo'));
    expect(row.ics).toContain('DTSTART;TZID=Asia/Tokyo:20261111T100000');
  });

  it('creates a new event in the zone picked', async function () {
    const start = at('2026-11-10T09:00', 'America/Chicago');
    const draft = { start, end: start + HOUR, isAllDay: false, calendarId: 'c', accountId: 'a' };
    await render(newEventOccurrence('__new_event_1', draft) as TimedOccurrence, null, true);

    pickZone('Asia/Tokyo');
    const { ics } = queueNewCalendarEvent(
      newEventOptions(draft, onUnsentChange.calls[0].args[0])
    ).event;

    expect(ics).toContain('DTSTART;TZID=Asia/Tokyo:20261110T090000');
    expect(ics).toContain('DTEND;TZID=Asia/Tokyo:20261110T100000');
  });

  it("holds a move to a zone at the same offset, though the times don't change", function () {
    const start = at('2026-11-10T09:00', 'Europe/Paris');
    const stored = { start, end: start + HOUR, isAllDay: false };
    const moved = { ...stored, timezone: 'Europe/Berlin' };

    expect(withTimes(null, ours(start, start + HOUR), moved, stored)?.times).toEqual(moved);
  });

  describe('on a series', function () {
    // Started in winter and changed from a summer occurrence, so Chicago is an hour nearer
    // Tokyo at the occurrence than at the series' start.
    const SERIES_ICS = icsOf(`BEGIN:VEVENT
UID:zone@test
DTSTART;TZID=America/Chicago:20260108T090000
DTEND;TZID=America/Chicago:20260108T100000
RRULE:FREQ=WEEKLY;UNTIL=20261231T150000Z
RDATE;TZID=America/Chicago:20260103T090000
EXDATE;TZID=America/Chicago:20260122T090000,20260716T090000
SUMMARY:Planning
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
BEGIN:VEVENT
UID:zone@test
RECURRENCE-ID;TZID=America/Chicago:20260205T090000
DTSTART;TZID=America/Chicago:20260205T110000
DTEND;TZID=America/Chicago:20260205T120000
SUMMARY:Planning
DTSTAMP:20260101T000000Z
SEQUENCE:1
END:VEVENT`);
    const slot = at('2026-07-09T09:00', 'America/Chicago');
    const times = {
      start: sameWallClockIn(slot, 'America/Chicago', 'Asia/Tokyo'),
      end: sameWallClockIn(slot + HOUR, 'America/Chicago', 'Asia/Tokyo'),
      isAllDay: false,
      timezone: 'Asia/Tokyo',
    };

    it('moves the rule to the zone, keeping its moved and deleted occurrences on their slots', function () {
      const row = rowFor(SERIES_ICS);
      modifySeriesChange(row, slot, { times, edits: [] });

      expect(row.ics).toContain('DTSTART;TZID=Asia/Tokyo:20260108T090000');
      expect(row.ics).toContain('EXDATE;TZID=Asia/Tokyo:20260122T090000,20260716T090000');
      expect(row.ics).toContain('RDATE;TZID=Asia/Tokyo:20260103T090000');
      expect(row.ics).toContain('UNTIL=20261231T000000Z');
      expect(row.ics).toContain('RECURRENCE-ID;TZID=Asia/Tokyo:20260205T090000');
      expect(row.ics).toContain('DTSTART;TZID=America/Chicago:20260205T110000');
    });

    it('is sent to every occurrence', function () {
      expect(scopesFor({ eventId: 'e1', slot, times, edits: [] })).toEqual(['all-occurrences']);
    });
  });
});

describe('formatTimezone', function () {
  it("leads with the zone's GMT offset at the time given, which DST moves", function () {
    const winter = at('2026-12-11T12:00', 'America/Los_Angeles');
    const summer = at('2026-07-10T12:00', 'America/Los_Angeles');

    expect(formatTimezone('America/Los_Angeles', winter)).toBe('(GMT-8) Pacific Time');
    expect(formatTimezone('America/Los_Angeles', summer)).toBe('(GMT-7) Pacific Time');
    expect(formatTimezone('Asia/Kolkata', winter)).toBe('(GMT+5:30) India Standard Time');
    expect(formatTimezone('Customized Time Zone', winter)).toBe('Customized Time Zone');
  });
});
