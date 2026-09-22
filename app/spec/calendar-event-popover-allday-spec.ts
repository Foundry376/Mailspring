import { Actions, DatabaseStore, SyncbackEventTask } from 'mailspring-exports';
import moment from 'moment';
import { Event as MailspringEvent } from '../src/flux/models/event';
import { CalendarEventPopover } from '../internal_packages/main-calendar/lib/core/calendar-event-popover';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

// A one-hour meeting, not recurring, so the save takes the absolute updateEventTimes path.
const START = moment('2026-03-10 10:00', 'YYYY-MM-DD HH:mm').unix();
const END = moment('2026-03-10 11:00', 'YYYY-MM-DD HH:mm').unix();

const TIMED_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:timed@test
DTSTART:20260310T160000Z
DTEND:20260310T170000Z
SUMMARY:Standup
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

function makeEvent() {
  return new MailspringEvent({
    id: 'event-1',
    accountId: 'account-1',
    calendarId: 'calendar-1',
    ics: TIMED_ICS,
    recurrenceStart: START,
    recurrenceEnd: END,
  } as any);
}

function makeOccurrence(): TimedOccurrence {
  return {
    id: 'event-1-e0',
    accountId: 'account-1',
    calendarId: 'calendar-1',
    title: 'Standup',
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

async function openEditor(event: MailspringEvent) {
  const popover: any = new CalendarEventPopover({
    event: makeOccurrence(),
    onEdit: () => {},
    onDelete: () => {},
  } as any);
  popover.setState = (update: object) => Object.assign(popover.state, update);
  spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(event));
  await popover.onEdit();
  return popover;
}

function lineOf(ics: string, prop: string) {
  return (new RegExp(`^${prop}[;:].*$`, 'm').exec(ics) || [])[0];
}

// The toggle leaves state.start and state.end at their wall-clock values, and two independent
// normalizers keep that out of the ICS: shiftEndWithStart's all-day branch, and
// createAllDayEndTime, which rolls end-1ms to the next day. These assert the written span, so
// they survive either one being removed and fail when both are.
describe('CalendarEventPopover all-day toggle', function () {
  let queued: any[];

  beforeEach(function () {
    queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => opts);
  });

  // Each row toggles all-day on from a timed event, then moves the start, and asserts the
  // written span. Spring forward is 2026-03-08, so two of these cross it.
  [
    {
      what: 'moving the start forward',
      to: '2026-03-12 10:00',
      dtstart: '20260312',
      dtend: '20260313',
    },
    {
      what: 'moving the start backward',
      to: '2026-03-04 10:00',
      dtstart: '20260304',
      dtend: '20260305',
    },
    {
      what: 'moving back across spring forward',
      to: '2026-03-06 10:00',
      dtstart: '20260306',
      dtend: '20260307',
    },
    {
      what: 'landing on the spring-forward day',
      to: '2026-03-08 10:00',
      dtstart: '20260308',
      dtend: '20260309',
    },
    {
      what: 'not moving the start at all',
      to: '2026-03-10 10:00',
      dtstart: '20260310',
      dtend: '20260311',
    },
  ].forEach(({ what, to, dtstart, dtend }) => {
    it(`writes one whole day when ${what}`, async function () {
      const event = makeEvent();
      const popover = await openEditor(event);

      popover.updateField('allDay', true);
      popover.updateStart(moment(to, 'YYYY-MM-DD HH:mm').unix());
      popover._saveAllOccurrences(event);

      const ics = queued[0].event.ics;
      expect(`${lineOf(ics, 'DTSTART')} ${lineOf(ics, 'DTEND')}`).toBe(
        `DTSTART;VALUE=DATE:${dtstart} DTEND;VALUE=DATE:${dtend}`
      );
    });
  });

  it('keeps a three-day span three days long', async function () {
    const event = makeEvent();
    const popover = await openEditor(event);

    popover.updateEnd(moment('2026-03-12 11:00', 'YYYY-MM-DD HH:mm').unix());
    popover.updateField('allDay', true);
    popover.updateStart(moment('2026-03-17 10:00', 'YYYY-MM-DD HH:mm').unix());
    popover._saveAllOccurrences(event);

    const ics = queued[0].event.ics;
    expect(lineOf(ics, 'DTSTART')).toBe('DTSTART;VALUE=DATE:20260317');
    expect(lineOf(ics, 'DTEND')).toBe('DTEND;VALUE=DATE:20260320');
  });
});
