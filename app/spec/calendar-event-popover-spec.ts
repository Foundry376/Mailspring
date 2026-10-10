import { AccountStore, Actions, DatabaseStore, SyncbackEventTask } from 'mailspring-exports';
import { Event as MailspringEvent } from '../src/flux/models/event';
import { CalendarEventPopover } from '../internal_packages/main-calendar/lib/core/calendar-event-popover';
import { TimedOccurrence } from '../internal_packages/main-calendar/lib/core/calendar-data-source';
import { AllDayToggle } from '../internal_packages/main-calendar/lib/core/all-day-toggle';
import { ShowAsSelector } from '../internal_packages/main-calendar/lib/core/show-as-selector';

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

// A Berlin series as Google writes it, for the zone picker.
const BERLIN_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0100
TZOFFSETTO:+0100
TZNAME:CET
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:berlin@test
DTSTART;TZID=Europe/Berlin:20260303T150000
DTEND;TZID=Europe/Berlin:20260303T160000
RRULE:FREQ=WEEKLY
EXDATE;TZID=Europe/Berlin:20260310T150000
SUMMARY:Standup
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

function makeOccurrence(title: string, extra: Partial<TimedOccurrence> = {}): TimedOccurrence {
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
    isMine: true,
    isException: false,
    isRecurring: true,
    organizer: null,
    attendees: [],
    start: START,
    end: END,
    ...extra,
  } as TimedOccurrence;
}

// The editor is exercised the way the UI drives it: onEdit reads the event's recurrence into
// state, updateField is what every input calls, and _saveAllOccurrences is the save. The
// component is not mounted, so setState is redirected straight into state.
async function openEditor(
  event: MailspringEvent,
  title: string,
  extra: Partial<TimedOccurrence> = {}
) {
  const popover: any = new CalendarEventPopover({
    event: makeOccurrence(title, extra),
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

/** SEQUENCE of each VEVENT in file order; null where a VEVENT has none. */
function sequencesOf(ics: string): (number | null)[] {
  return ics
    .replace(/\r\n[ \t]/g, '')
    .split('BEGIN:VEVENT')
    .slice(1)
    .map((v) => {
      const m = /^SEQUENCE:(\d+)$/m.exec(v);
      return m ? parseInt(m[1], 10) : null;
    });
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

  it('rezones a series when the zone picker changed, and brings its EXDATEs along', async function () {
    const event = makeEvent(BERLIN_ICS);
    const popover = await openEditor(event, 'Standup');
    expect(popover.state.timezone).toBe('Europe/Berlin');
    popover.updateField('timezone', 'America/Chicago');

    popover._saveAllOccurrences(event);

    const ics = queued[0].event.ics;
    expect(ics).toContain('DTSTART;TZID=America/Chicago:20260303T080000');
    expect(ics).toContain('EXDATE;TZID=America/Chicago:20260310T080000');
    expect(ics).toContain('TZID:America/Chicago');
    expect(ics).not.toContain('TZID:Europe/Berlin');
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

describe('CalendarEventPopover save path and SEQUENCE', function () {
  let queued: any[];

  beforeEach(function () {
    queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => opts);
  });

  it('revises the series once however many fields one save changed', async function () {
    const event = makeEvent(FORTNIGHTLY_ICS);
    const popover = await openEditor(event, 'Planning');
    popover.updateField('title', 'Planning (renamed)');
    popover.updateField('repeat', 'daily');
    popover.updateStart(START + 3600);

    popover._saveAllOccurrences(event);

    expect(sequencesOf(queued[0].event.ics)).toEqual([1]);
  });

  it('revises a series that never carried a SEQUENCE', async function () {
    const event = makeEvent(FORTNIGHTLY_ICS.replace('SEQUENCE:0\n', ''));
    const popover = await openEditor(event, 'Planning');
    popover.updateField('title', 'Planning (renamed)');

    popover._saveAllOccurrences(event);

    expect(sequencesOf(queued[0].event.ics)).toEqual([1]);
  });

  it('revises only the occurrence when one occurrence is edited', async function () {
    const event = makeEvent(FORTNIGHTLY_ICS);
    const popover = await openEditor(event, 'Planning');
    popover.updateStart(START + 3600);

    await popover._saveOccurrenceException(event);

    expect(sequencesOf(queued[0].event.ics)).toEqual([0, 1]);
  });
});

describe('CalendarEventPopover and who may edit', function () {
  const popoverFor = (props: object) =>
    new CalendarEventPopover({
      event: makeOccurrence('Planning'),
      onEdit: () => {},
      onDelete: () => {},
      ...props,
    } as any) as any;

  it('does not offer to edit a meeting somebody else organizes', function () {
    const theirs = { ...makeOccurrence('Planning'), isMine: false };
    expect(popoverFor({ event: theirs })._isEditable()).toBe(false);
  });

  it('offers to edit a meeting we organize on a writable calendar', function () {
    expect(popoverFor({})._isEditable()).toBe(true);
  });

  it('never offers to edit on a read-only calendar', function () {
    expect(popoverFor({ isCalendarReadOnly: true })._isEditable()).toBe(false);
  });

  it('always lets a new event be edited', function () {
    const theirs = { ...makeOccurrence('Planning'), isMine: false };
    expect(popoverFor({ event: theirs, isNewEvent: true })._isEditable()).toBe(true);
  });

  it('opens straight into the editor when asked, reading the rule off the event first', async function () {
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(makeEvent(FORTNIGHTLY_ICS)));
    const popover = popoverFor({ startEditing: true });
    popover.setState = (update: object) => Object.assign(popover.state, update);
    expect(popover.state.editing).toBe(true);
    expect(popover.state.repeat).toBe('none');

    popover.componentDidMount();
    // The load is one awaited find; the runner mocks timers, so settle it on microtasks alone.
    for (let i = 0; i < 4; i++) await Promise.resolve();

    expect(popover.state.repeat).toBe('weekly');
    expect(popover.state.originalRepeat).toBe('weekly');
  });

  it('does not read a rule for a new event, which has none yet', async function () {
    const find = spyOn(DatabaseStore, 'find');
    const popover = popoverFor({ startEditing: true, isNewEvent: true });
    popover.componentDidMount();
    expect(find).not.toHaveBeenCalled();
  });
});

describe('CalendarEventPopover save path and the organizer', function () {
  let queued: any[];

  beforeEach(function () {
    queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => opts);
    spyOn(AccountStore, 'accountForId').andReturn({ emailAddress: 'me@example.com', name: 'Me' });
  });

  it('names the account as organizer when the first guest is added to the series', async function () {
    const event = makeEvent(FORTNIGHTLY_ICS);
    const popover = await openEditor(event, 'Planning');
    popover.updateAttendees([{ email: 'bo@example.com', name: 'Bo' }]);

    popover._saveAllOccurrences(event);

    expect(queued[0].event.ics).toContain('ORGANIZER;CN=Me:mailto:me@example.com');
  });

  it('names the account as organizer when the first guest is added to one occurrence', async function () {
    const event = makeEvent(FORTNIGHTLY_ICS);
    const popover = await openEditor(event, 'Planning');
    popover.updateAttendees([{ email: 'bo@example.com', name: 'Bo' }]);

    await popover._saveOccurrenceException(event);

    const vevents = queued[0].event.ics.split('BEGIN:VEVENT').slice(1);
    expect(vevents.length).toBe(2);
    for (const vevent of vevents) {
      expect(vevent).toContain('ORGANIZER;CN=Me:mailto:me@example.com');
    }
  });
});

describe('CalendarEventPopover save path and Show As', function () {
  // Google writes TRANSP on every VEVENT, and makes all-day events TRANSPARENT by default.
  const BUSY_SERIES_ICS = FORTNIGHTLY_ICS.replace('SEQUENCE:0', 'SEQUENCE:0\nTRANSP:OPAQUE');
  const FREE_SERIES_ICS = FORTNIGHTLY_ICS.replace('SEQUENCE:0', 'SEQUENCE:0\nTRANSP:TRANSPARENT');
  let queued: any[];

  beforeEach(function () {
    queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => queued.push(task));
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => opts);
  });

  /** TRANSP of each VEVENT in file order; null where a VEVENT has none. */
  const transpsOf = (ics: string) =>
    ics
      .split('BEGIN:VEVENT')
      .slice(1)
      .map((v) => (/^TRANSP:(.*)$/m.exec(v) || [])[1] || null);

  it('shows a free event as Free', async function () {
    const free = await openEditor(makeEvent(FREE_SERIES_ICS), 'Planning', { isFree: true });
    expect(free.state.showAs).toBe('TRANSPARENT');
  });

  it('shows a busy event as Busy', async function () {
    const busy = await openEditor(makeEvent(BUSY_SERIES_ICS), 'Planning', { isFree: false });
    expect(busy.state.showAs).toBe('OPAQUE');
  });

  it('marks the series free when Show As changes to Free', async function () {
    const event = makeEvent(BUSY_SERIES_ICS);
    const popover = await openEditor(event, 'Planning');
    popover.updateShowAs('TRANSPARENT');

    popover._saveAllOccurrences(event);

    expect(transpsOf(queued[0].event.ics)).toEqual(['TRANSPARENT']);
    expect(sequencesOf(queued[0].event.ics)).toEqual([1]);
  });

  it('marks a free series busy when Show As changes to Busy', async function () {
    const event = makeEvent(FREE_SERIES_ICS);
    const popover = await openEditor(event, 'Planning', { isFree: true });
    popover.updateShowAs('OPAQUE');

    popover._saveAllOccurrences(event);

    expect(transpsOf(queued[0].event.ics)).toEqual(['OPAQUE']);
  });

  it('leaves TRANSP as it was when Show As was not touched', async function () {
    const event = makeEvent(FORTNIGHTLY_ICS);
    const popover = await openEditor(event, 'Planning');
    popover.updateField('title', 'Planning (renamed)');

    popover._saveAllOccurrences(event);

    expect(transpsOf(queued[0].event.ics)).toEqual([null]);
  });

  it('marks only the occurrence free when one occurrence is edited', async function () {
    const event = makeEvent(BUSY_SERIES_ICS);
    const popover = await openEditor(event, 'Planning');
    popover.updateShowAs('TRANSPARENT');

    await popover._saveOccurrenceException(event);

    expect(transpsOf(queued[0].event.ics)).toEqual(['OPAQUE', 'TRANSPARENT']);
  });

  it('adds no TRANSP to an occurrence whose Show As was not touched', async function () {
    const event = makeEvent(FORTNIGHTLY_ICS);
    const popover = await openEditor(event, 'Planning');
    popover.updateField('title', 'Planning (moved)');

    await popover._saveOccurrenceException(event);

    expect(transpsOf(queued[0].event.ics)).toEqual([null, null]);
  });

  it('follows the event when it changes under the editor', async function () {
    const popover = await openEditor(makeEvent(BUSY_SERIES_ICS), 'Planning');
    const prevProps = popover.props;
    popover.props = { ...prevProps, event: makeOccurrence('Planning', { isFree: true }) };
    popover.componentDidUpdate(prevProps, popover.state);
    expect(popover.state.showAs).toBe('TRANSPARENT');
    expect(popover._changedShowAs()).toBe(undefined);
  });

  // A popover for an event that does not exist yet, as the grid opens one.
  const newEventPopover = (isAllDay: boolean) => {
    const popover: any = new CalendarEventPopover({
      event: makeOccurrence('', { isAllDay } as any),
      isNewEvent: true,
    } as any);
    popover.setState = (update: object) => Object.assign(popover.state, update);
    return popover;
  };

  /** The first element of this type in a rendered tree. */
  const findElement = (node: any, type: any): any => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findElement(child, type);
        if (found) return found;
      }
      return null;
    }
    if (node.type === type) return node;
    return findElement(node.props && node.props.children, type);
  };

  it('opens a new all-day event as Free and a new timed one as Busy', function () {
    expect(newEventPopover(true).state.showAs).toBe('TRANSPARENT');
    expect(newEventPopover(false).state.showAs).toBe('OPAQUE');
  });

  it('opens an existing all-day event with the Show As it has', async function () {
    const busy = await openEditor(makeEvent(BUSY_SERIES_ICS), 'Planning', {
      isAllDay: true,
      isFree: false,
    } as any);
    expect(busy.state.showAs).toBe('OPAQUE');
  });

  it('moves a new event between Busy and Free with the all-day switch', function () {
    const popover = newEventPopover(false);
    popover.updateAllDay(true);
    expect(popover.state.allDay).toBe(true);
    expect(popover.state.showAs).toBe('TRANSPARENT');
    popover.updateAllDay(false);
    expect(popover.state.showAs).toBe('OPAQUE');
  });

  it("keeps a new event's Show As once the user has picked one", function () {
    const popover = newEventPopover(false);
    popover.updateShowAs('OPAQUE');
    popover.updateAllDay(true);
    expect(popover.state.allDay).toBe(true);
    expect(popover.state.showAs).toBe('OPAQUE');
  });

  it("leaves an existing event's Show As alone when it is made all-day", async function () {
    const popover = await openEditor(makeEvent(BUSY_SERIES_ICS), 'Planning');
    popover.updateAllDay(true);
    expect(popover.state.allDay).toBe(true);
    expect(popover.state.showAs).toBe('OPAQUE');
  });

  it('follows the all-day switch again for the next event the editor is given', function () {
    const popover = newEventPopover(false);
    popover.updateShowAs('OPAQUE');
    const prevProps = popover.props;
    popover.props = { ...prevProps, event: makeOccurrence('Other', { isAllDay: false } as any) };
    popover.componentDidUpdate(prevProps, popover.state);
    popover.updateAllDay(true);
    expect(popover.state.showAs).toBe('TRANSPARENT');
  });

  it('wires the all-day switch and Show As control to their handlers', function () {
    const popover = newEventPopover(false);
    const tree = popover.renderEditable();
    expect(findElement(tree, AllDayToggle).props.onChange).toBe(popover.updateAllDay);
    expect(findElement(tree, ShowAsSelector).props.onChange).toBe(popover.updateShowAs);
  });

  it('creates a new all-day event as Free when Show As was left alone', async function () {
    const helpers = require('../internal_packages/main-calendar/lib/core/calendar-helpers');
    spyOn(helpers, 'createCalendarEvent').andReturn(Promise.resolve());
    spyOn(Actions, 'closePopover');
    await newEventPopover(true)._createNewEvent();
    expect(helpers.createCalendarEvent.mostRecentCall.args[0].transparency).toBe('TRANSPARENT');
  });

  it('creates the event with the Show As the user picked', async function () {
    const helpers = require('../internal_packages/main-calendar/lib/core/calendar-helpers');
    spyOn(helpers, 'createCalendarEvent').andReturn(Promise.resolve());
    spyOn(Actions, 'closePopover');
    const popover: any = new CalendarEventPopover({
      event: makeOccurrence(''),
      isNewEvent: true,
    } as any);
    popover.setState = (update: object) => Object.assign(popover.state, update);
    popover.updateShowAs('TRANSPARENT');

    await popover._createNewEvent();

    expect(helpers.createCalendarEvent.mostRecentCall.args[0].transparency).toBe('TRANSPARENT');
  });
});
