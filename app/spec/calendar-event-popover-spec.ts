import { Actions, DatabaseStore, SyncbackEventTask } from 'mailspring-exports';
import { Event as MailspringEvent } from '../src/flux/models/event';
import { CalendarEventPopover } from '../internal_packages/main-calendar/lib/core/calendar-event-popover';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

// A fortnightly Tue/Thu meeting that ends in June. Every part of this rule beyond FREQ is
// something the five-value Repeat control cannot express.
const DETAILED_RRULE = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20260630T000000Z';

const FORTNIGHTLY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:fortnightly@test
DTSTART:20260303T140000Z
DTEND:20260303T150000Z
RRULE:${DETAILED_RRULE}
EXDATE:20260317T140000Z
SUMMARY:Planning
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

// A series defined by explicit dates only. It has no RRULE, so the Repeat control reads 'none'.
const RDATE_ONLY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:rdate-only@test
DTSTART:20260303T140000Z
DTEND:20260303T150000Z
RDATE:20260310T140000Z,20260324T140000Z
SUMMARY:Board meeting
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

const START = Date.UTC(2026, 2, 3, 14, 0, 0) / 1000;
const END = Date.UTC(2026, 2, 3, 15, 0, 0) / 1000;

function makeEvent(ics: string) {
  return new MailspringEvent({
    id: 'event-1',
    accountId: 'account-1',
    calendarId: 'calendar-1',
    ics,
    recurrenceStart: START,
    recurrenceEnd: END,
  } as any);
}

function makeOccurrence(title: string): TimedOccurrence {
  return {
    id: 'event-1-e0',
    accountId: 'account-1',
    calendarId: 'calendar-1',
    title,
    location: '',
    description: '',
    isAllDay: false,
    isCancelled: false,
    isPending: false,
    isException: false,
    isRecurring: true,
    organizer: null,
    attendees: [],
    start: START,
    end: END,
  } as TimedOccurrence;
}

// The editor is exercised the way the UI drives it: onEdit reads the event's recurrence into
// state, updateField is what every input calls, and _saveAllOccurrences is the save. The
// component is not mounted, so setState is redirected straight into state.
async function openEditor(event: MailspringEvent, title: string) {
  const popover: any = new CalendarEventPopover({
    event: makeOccurrence(title),
    onEdit: () => {},
    onDelete: () => {},
  } as any);
  popover.setState = (update: object) => Object.assign(popover.state, update);
  spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(event));
  await popover.onEdit();
  return popover;
}

function rruleOf(ics: string): string | undefined {
  return (/^RRULE:(.*)$/m.exec(ics) || [])[1];
}

describe('CalendarEventPopover save path and the recurrence rule', function () {
  let queued: any[];

  beforeEach(function () {
    queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => opts);
  });

  it('keeps a detailed RRULE when only the title changed', async function () {
    const event = makeEvent(FORTNIGHTLY_ICS);
    const popover = await openEditor(event, 'Planning');
    expect(popover.state.repeat).toBe('weekly');
    popover.updateField('title', 'Planning (renamed)');

    popover._saveAllOccurrences(event);

    expect(queued.length).toBe(1);
    const ics = queued[0].event.ics;
    expect(ics).toContain('SUMMARY:Planning (renamed)');
    expect(rruleOf(ics)).toBe(DETAILED_RRULE);
    expect(ics).toContain('EXDATE:20260317T140000Z');
  });

  it('keeps an RDATE-only series intact when only the title changed', async function () {
    const event = makeEvent(RDATE_ONLY_ICS);
    const popover = await openEditor(event, 'Board meeting');
    expect(popover.state.repeat).toBe('none');
    popover.updateField('title', 'Board meeting (renamed)');

    popover._saveAllOccurrences(event);

    expect(queued.length).toBe(1);
    expect(queued[0].event.ics).toContain('RDATE:20260310T140000Z,20260324T140000Z');
  });

  it('still writes the rule the user picked when the Repeat control changed', async function () {
    const event = makeEvent(FORTNIGHTLY_ICS);
    const popover = await openEditor(event, 'Planning');
    popover.updateField('repeat', 'daily');

    popover._saveAllOccurrences(event);

    expect(queued.length).toBe(1);
    expect(rruleOf(queued[0].event.ics)).toBe('FREQ=DAILY');
  });
});
