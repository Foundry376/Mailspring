import { Actions, ICSEventHelpers, CalendarUtils, SyncbackEventTask } from 'mailspring-exports';
import { Event as MailspringEvent } from '../src/flux/models/event';

// Import the functions under test directly from the source file.
// We use a relative path because the plugin is not registered in mailspring-exports.
import {
  modifySimpleEvent,
  modifySimpleEventProperty,
  modifySimpleEventChange,
  createOccurrenceException,
  modifyAllOccurrences,
  modifyEventWithRecurringSupport,
  modifyOccurrenceChange,
  modifySeriesChange,
} from '../internal_packages/main-calendar/lib/core/recurring-event-actions';

// ---------------------------------------------------------------------------
// Minimal ICS fixtures
// ---------------------------------------------------------------------------

const RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-uid@test
DTSTART:20260301T060000Z
DTEND:20260301T070000Z
RRULE:FREQ=DAILY;COUNT=10
SUMMARY:Daily Standup
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

const SIMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:simple-uid@test
DTSTART:20260301T140000Z
DTEND:20260301T150000Z
SUMMARY:Team Lunch
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

// ICS for a standalone exception DB record: has RECURRENCE-ID but no RRULE.
// This is what legacy (server-sent or pre-inline-fix) exception records look like.
const STANDALONE_EXCEPTION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-uid@test
RECURRENCE-ID:20260302T060000Z
DTSTART:20260302T080000Z
DTEND:20260302T090000Z
SUMMARY:Daily Standup (moved)
DTSTAMP:20260101T000000Z
SEQUENCE:1
END:VEVENT
END:VCALENDAR`;

// Fake ICS that createRecurrenceException returns as masterIcs
const FAKE_MASTER_ICS_WITH_EXCEPTION = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-uid@test
DTSTART:20260301T060000Z
DTEND:20260301T070000Z
RRULE:FREQ=DAILY;COUNT=10
SUMMARY:Daily Standup
DTSTAMP:20260101T000001Z
SEQUENCE:0
END:VEVENT
BEGIN:VEVENT
UID:recurring-uid@test
RECURRENCE-ID:20260302T060000Z
DTSTART:20260302T080000Z
DTEND:20260302T090000Z
SUMMARY:Daily Standup
DTSTAMP:20260101T000001Z
SEQUENCE:1
END:VEVENT
END:VCALENDAR`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(ics: string, overrides: Partial<MailspringEvent> = {}): MailspringEvent {
  return new MailspringEvent({
    id: 'event-id-1',
    accountId: 'account-id-1',
    calendarId: 'calendar-id-1',
    ics,
    recurrenceStart: Date.UTC(2026, 2, 1, 6, 0, 0) / 1000,
    recurrenceEnd: Date.UTC(2026, 2, 1, 7, 0, 0) / 1000,
    ...overrides,
  } as any);
}

// Timestamps reused throughout the tests
const T_OCC2_START = Date.UTC(2026, 2, 2, 6, 0, 0) / 1000; // 2026-03-02T06:00Z
const T_OCC2_END = Date.UTC(2026, 2, 2, 7, 0, 0) / 1000;
const T_NEW_START = Date.UTC(2026, 2, 2, 8, 0, 0) / 1000; // 2026-03-02T08:00Z (+2h)
const T_NEW_END = Date.UTC(2026, 2, 2, 9, 0, 0) / 1000;

// ---------------------------------------------------------------------------
// modifySimpleEvent
// ---------------------------------------------------------------------------

describe('modifySimpleEvent', function () {
  beforeEach(function () {
    spyOn(ICSEventHelpers, 'updateEventTimes').andCallFake((ics, _opts) => ics);
    // bumpEventSequence passes through so the ICS comparisons stay about the edit.
    spyOn(ICSEventHelpers, 'bumpEventSequence').andCallFake((ics: string) => ics);
    spyOn(Actions, 'queueTask');
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => ({ _opts: opts }));
  });

  it('revises the event once, after the times are written', function () {
    const event = makeEvent(SIMPLE_ICS);
    modifySimpleEvent({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });
    expect(ICSEventHelpers.bumpEventSequence).toHaveBeenCalledWith(SIMPLE_ICS);
    expect((ICSEventHelpers.bumpEventSequence as jasmine.Spy).callCount).toBe(1);
  });

  it('calls ICSEventHelpers.updateEventTimes with the correct options', function () {
    const event = makeEvent(SIMPLE_ICS);
    modifySimpleEvent({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(ICSEventHelpers.updateEventTimes).toHaveBeenCalledWith(SIMPLE_ICS, {
      start: T_NEW_START,
      end: T_NEW_END,
      isAllDay: false,
    });
  });

  it('updates event.recurrenceStart and event.recurrenceEnd', function () {
    const event = makeEvent(SIMPLE_ICS);
    modifySimpleEvent({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(event.recurrenceStart).toBe(T_NEW_START);
    expect(event.recurrenceEnd).toBe(T_NEW_END);
  });

  it('queues a SyncbackEventTask via Actions.queueTask', function () {
    const event = makeEvent(SIMPLE_ICS);
    modifySimpleEvent({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(Actions.queueTask).toHaveBeenCalled();
    expect(SyncbackEventTask.forUpdating).toHaveBeenCalled();
  });

  it('passes undoData to SyncbackEventTask.forUpdating (captured before modification)', function () {
    const originalIcs = SIMPLE_ICS;
    const originalStart = Date.UTC(2026, 2, 1, 14, 0, 0) / 1000;
    const originalEnd = Date.UTC(2026, 2, 1, 15, 0, 0) / 1000;
    const event = makeEvent(originalIcs, {
      recurrenceStart: originalStart,
      recurrenceEnd: originalEnd,
    } as any);

    modifySimpleEvent({
      event,
      originalOccurrenceStart: originalStart,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    const callArgs = (SyncbackEventTask.forUpdating as jasmine.Spy).calls[0].args[0];
    expect(callArgs.undoData).toBeDefined();
    expect(callArgs.undoData.ics).toBe(originalIcs);
    expect(callArgs.undoData.recurrenceStart).toBe(originalStart);
    expect(callArgs.undoData.recurrenceEnd).toBe(originalEnd);
  });

  it('uses the provided description in the task', function () {
    const event = makeEvent(SIMPLE_ICS);
    modifySimpleEvent({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
      description: 'Move event',
    });

    const callArgs = (SyncbackEventTask.forUpdating as jasmine.Spy).calls[0].args[0];
    expect(callArgs.description).toBe('Move event');
  });
});

// ---------------------------------------------------------------------------
// createOccurrenceException
// ---------------------------------------------------------------------------

describe('createOccurrenceException', function () {
  beforeEach(function () {
    spyOn(ICSEventHelpers, 'createRecurrenceException').andCallFake(
      (_masterIcs, _origStart, _newStart, _newEnd, _isAllDay) => ({
        masterIcs: FAKE_MASTER_ICS_WITH_EXCEPTION,
        recurrenceId: '20260302T060000Z',
      })
    );
    spyOn(ICSEventHelpers, 'bumpEventSequence').andCallFake((ics: string) => ics);
    spyOn(Actions, 'queueTask');
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => ({ _opts: opts }));
  });

  it('advances the exception occurrence, not the whole series', function () {
    const masterEvent = makeEvent(RECURRING_ICS);
    createOccurrenceException({
      event: masterEvent,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_OCC2_START + 7200,
      newEnd: T_OCC2_START + 10800,
      isAllDay: false,
    });
    expect(ICSEventHelpers.bumpEventSequence).toHaveBeenCalledWith(
      FAKE_MASTER_ICS_WITH_EXCEPTION,
      '20260302T060000Z'
    );
  });

  it('calls ICSEventHelpers.createRecurrenceException with the correct arguments', function () {
    const event = makeEvent(RECURRING_ICS);
    createOccurrenceException({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(ICSEventHelpers.createRecurrenceException).toHaveBeenCalledWith(
      RECURRING_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
  });

  it('updates masterEvent.ics with the returned masterIcs', function () {
    const event = makeEvent(RECURRING_ICS);
    createOccurrenceException({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(event.ics).toBe(FAKE_MASTER_ICS_WITH_EXCEPTION);
  });

  it('updates masterEvent.recurrenceStart and recurrenceEnd', function () {
    const event = makeEvent(RECURRING_ICS);
    createOccurrenceException({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(event.recurrenceStart).toBe(T_NEW_START);
    expect(event.recurrenceEnd).toBe(T_NEW_END);
  });

  it('queues exactly one task (NOT forCreating, only forUpdating)', function () {
    spyOn(SyncbackEventTask, 'forCreating');
    const event = makeEvent(RECURRING_ICS);
    createOccurrenceException({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(Actions.queueTask).toHaveBeenCalled();
    expect(SyncbackEventTask.forCreating).not.toHaveBeenCalled();
    expect((SyncbackEventTask.forUpdating as jasmine.Spy).calls.length).toBe(1);
  });

  it('passes the master event (not a new event) to forUpdating', function () {
    const event = makeEvent(RECURRING_ICS);
    createOccurrenceException({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    const callArgs = (SyncbackEventTask.forUpdating as jasmine.Spy).calls[0].args[0];
    expect(callArgs.event).toBe(event);
  });

  it('captures undo data from the master event BEFORE modifying it', function () {
    const originalIcs = RECURRING_ICS;
    const originalStart = Date.UTC(2026, 2, 1, 6, 0, 0) / 1000;
    const originalEnd = Date.UTC(2026, 2, 1, 7, 0, 0) / 1000;
    const event = makeEvent(originalIcs, {
      recurrenceStart: originalStart,
      recurrenceEnd: originalEnd,
    } as any);

    createOccurrenceException({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    const callArgs = (SyncbackEventTask.forUpdating as jasmine.Spy).calls[0].args[0];
    expect(callArgs.undoData).toBeDefined();
    // undoData should reflect the state BEFORE createRecurrenceException was called
    expect(callArgs.undoData.ics).toBe(originalIcs);
    expect(callArgs.undoData.recurrenceStart).toBe(originalStart);
    expect(callArgs.undoData.recurrenceEnd).toBe(originalEnd);
  });

  it('uses the provided description in the task', function () {
    const event = makeEvent(RECURRING_ICS);
    createOccurrenceException({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
      description: 'Edit occurrence',
    });

    const callArgs = (SyncbackEventTask.forUpdating as jasmine.Spy).calls[0].args[0];
    expect(callArgs.description).toBe('Edit occurrence');
  });
});

// ---------------------------------------------------------------------------
// modifyAllOccurrences
// ---------------------------------------------------------------------------

describe('modifyAllOccurrences', function () {
  // A fake ICS produced by updateRecurringEventTimes (DTSTART shifted by +2h)
  const SHIFTED_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-uid@test
DTSTART:20260301T080000Z
DTEND:20260301T090000Z
RRULE:FREQ=DAILY;COUNT=10
SUMMARY:Daily Standup
DTSTAMP:20260101T000001Z
SEQUENCE:1
END:VEVENT
END:VCALENDAR`;

  // What shiftInlineExceptions returns (same as input when no exceptions present)
  const SHIFTED_ICS_AFTER_EXCEPTIONS = SHIFTED_ICS;

  // Fake parsed event for CalendarUtils.parseICSString to return
  function makeFakeParsedEvent(startMs: number, endMs: number) {
    return {
      event: {
        startDate: {
          toJSDate: () => new Date(startMs),
        },
        endDate: {
          toJSDate: () => new Date(endMs),
        },
      },
    };
  }

  beforeEach(function () {
    spyOn(ICSEventHelpers, 'updateRecurringEventTimes').andCallFake(() => SHIFTED_ICS);
    spyOn(ICSEventHelpers, 'shiftInlineExceptions').andCallFake((ics) => ics);
    spyOn(ICSEventHelpers, 'bumpEventSequence').andCallFake((ics: string) => ics);
    spyOn(CalendarUtils, 'parseICSString').andCallFake(() =>
      makeFakeParsedEvent(
        Date.UTC(2026, 2, 1, 8, 0, 0), // new DTSTART = 08:00Z
        Date.UTC(2026, 2, 1, 9, 0, 0) // new DTEND = 09:00Z
      )
    );
    spyOn(Actions, 'queueTask');
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => ({ _opts: opts }));
  });

  it('revises the series once, after the shift', function () {
    const event = makeEvent(RECURRING_ICS);
    modifyAllOccurrences({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_OCC2_START + 7200,
      newEnd: T_OCC2_START + 10800,
      isAllDay: false,
    });
    expect(ICSEventHelpers.bumpEventSequence).toHaveBeenCalledWith(SHIFTED_ICS);
    expect((ICSEventHelpers.bumpEventSequence as jasmine.Spy).callCount).toBe(1);
  });

  it('calls ICSEventHelpers.updateRecurringEventTimes with correct arguments', function () {
    const event = makeEvent(RECURRING_ICS);
    modifyAllOccurrences({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(ICSEventHelpers.updateRecurringEventTimes).toHaveBeenCalledWith(
      RECURRING_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
  });

  it('calls shiftInlineExceptions with the correct deltaMs when delta is non-zero', function () {
    const event = makeEvent(RECURRING_ICS);
    // delta = (T_NEW_START - T_OCC2_START) * 1000 = (8:00 - 6:00) = 2h = 7200000ms
    const expectedDeltaMs = (T_NEW_START - T_OCC2_START) * 1000;

    modifyAllOccurrences({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(ICSEventHelpers.shiftInlineExceptions).toHaveBeenCalledWith(
      SHIFTED_ICS,
      expectedDeltaMs
    );
  });

  it('does NOT call shiftInlineExceptions when deltaMs is 0', function () {
    const event = makeEvent(RECURRING_ICS);
    modifyAllOccurrences({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_OCC2_START, // same start → delta = 0
      newEnd: T_OCC2_END,
      isAllDay: false,
    });

    expect(ICSEventHelpers.shiftInlineExceptions).not.toHaveBeenCalled();
  });

  it('queues a SyncbackEventTask.forUpdating (not forCreating)', function () {
    spyOn(SyncbackEventTask, 'forCreating');
    const event = makeEvent(RECURRING_ICS);
    modifyAllOccurrences({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(Actions.queueTask).toHaveBeenCalled();
    expect(SyncbackEventTask.forCreating).not.toHaveBeenCalled();
    expect((SyncbackEventTask.forUpdating as jasmine.Spy).calls.length).toBe(1);
  });

  it('captures undo data from the event BEFORE modifying it', function () {
    const originalIcs = RECURRING_ICS;
    const originalStart = Date.UTC(2026, 2, 1, 6, 0, 0) / 1000;
    const originalEnd = Date.UTC(2026, 2, 1, 7, 0, 0) / 1000;
    const event = makeEvent(originalIcs, {
      recurrenceStart: originalStart,
      recurrenceEnd: originalEnd,
    } as any);

    modifyAllOccurrences({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    const callArgs = (SyncbackEventTask.forUpdating as jasmine.Spy).calls[0].args[0];
    expect(callArgs.undoData).toBeDefined();
    expect(callArgs.undoData.ics).toBe(originalIcs);
    expect(callArgs.undoData.recurrenceStart).toBe(originalStart);
    expect(callArgs.undoData.recurrenceEnd).toBe(originalEnd);
  });

  it('updates event.recurrenceStart / recurrenceEnd from the re-parsed ICS', function () {
    const event = makeEvent(RECURRING_ICS);
    modifyAllOccurrences({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    // CalendarUtils.parseICSString fake returns 08:00Z / 09:00Z
    expect(event.recurrenceStart).toBe(Date.UTC(2026, 2, 1, 8, 0, 0) / 1000);
    expect(event.recurrenceEnd).toBe(Date.UTC(2026, 2, 1, 9, 0, 0) / 1000);
  });

  it('calls CalendarUtils.parseICSString to extract new master times', function () {
    const event = makeEvent(RECURRING_ICS);
    modifyAllOccurrences({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
    });

    expect(CalendarUtils.parseICSString).toHaveBeenCalled();
  });

  it('uses the provided description in the queued task', function () {
    const event = makeEvent(RECURRING_ICS);
    modifyAllOccurrences({
      event,
      originalOccurrenceStart: T_OCC2_START,
      newStart: T_NEW_START,
      newEnd: T_NEW_END,
      isAllDay: false,
      description: 'Reschedule all',
    });

    const callArgs = (SyncbackEventTask.forUpdating as jasmine.Spy).calls[0].args[0];
    expect(callArgs.description).toBe('Reschedule all');
  });
});

// ---------------------------------------------------------------------------
// modifyEventWithRecurringSupport
// ---------------------------------------------------------------------------

describe('modifyEventWithRecurringSupport', function () {
  // Spy on the underlying Electron dialog that showRecurringEventDialog calls.
  // This is the same pattern used by draft-store-spec.ts. We control what button
  // index the dialog returns (0=this-occurrence, 1=all-occurrences, 2=cancel).
  let dialogSpy: jasmine.Spy;

  beforeEach(function () {
    dialogSpy = spyOn(require('@electron/remote').dialog, 'showMessageBoxSync').andReturn(2); // default: cancel

    // Stub ICS helpers so we can verify which branch is taken without real ICS parsing
    spyOn(ICSEventHelpers, 'createRecurrenceException').andCallFake(() => ({
      masterIcs: FAKE_MASTER_ICS_WITH_EXCEPTION,
      recurrenceId: '20260302T060000Z',
    }));
    spyOn(ICSEventHelpers, 'updateEventTimes').andCallFake((ics) => ics);
    spyOn(ICSEventHelpers, 'updateRecurringEventTimes').andCallFake(
      () => FAKE_MASTER_ICS_WITH_EXCEPTION
    );
    spyOn(ICSEventHelpers, 'shiftInlineExceptions').andCallFake((ics) => ics);
    spyOn(ICSEventHelpers, 'bumpEventSequence').andCallFake((ics: string) => ics);
    spyOn(Actions, 'queueTask');
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => ({ _opts: opts }));

    // Fake CalendarUtils.parseICSString for the modifyAllOccurrences code path
    spyOn(CalendarUtils, 'parseICSString').andCallFake(() => ({
      event: {
        startDate: { toJSDate: () => new Date(Date.UTC(2026, 2, 1, 8, 0, 0)) },
        endDate: { toJSDate: () => new Date(Date.UTC(2026, 2, 1, 9, 0, 0)) },
      },
    }));

    // Stub isRecurringEvent so the CalendarUtils.parseICSString spy above does not
    // interfere with it (both use the same module cache entry, so the spy would
    // intercept the parseICSString call inside isRecurringEvent and return an object
    // without `root`, causing `root.name` to throw).
    spyOn(ICSEventHelpers, 'isRecurringEvent').andCallFake((ics) => ics.includes('RRULE'));
  });

  describe('when isException is true (occurrence is already an inline exception)', function () {
    it('calls createOccurrenceException directly without showing the dialog', async function () {
      const event = makeEvent(RECURRING_ICS);
      const result = await modifyEventWithRecurringSupport(
        {
          event,
          originalOccurrenceStart: T_OCC2_START,
          newStart: T_NEW_START,
          newEnd: T_NEW_END,
          isAllDay: false,
          isException: true,
        },
        'move',
        'Daily Standup'
      );

      expect(result.success).toBe(true);
      expect(result.masterEvent).toBe(event);

      // createRecurrenceException must have been called (via createOccurrenceException)
      expect(ICSEventHelpers.createRecurrenceException).toHaveBeenCalled();

      // The Electron dialog must NOT have been shown
      expect(dialogSpy.calls.length).toBe(0);
    });

    it('queues exactly one SyncbackEventTask.forUpdating call', async function () {
      const event = makeEvent(RECURRING_ICS);
      await modifyEventWithRecurringSupport(
        {
          event,
          originalOccurrenceStart: T_OCC2_START,
          newStart: T_NEW_START,
          newEnd: T_NEW_END,
          isAllDay: false,
          isException: true,
        },
        'move',
        'Daily Standup'
      );

      expect(Actions.queueTask).toHaveBeenCalled();
      expect((SyncbackEventTask.forUpdating as jasmine.Spy).calls.length).toBe(1);
    });
  });

  describe('when isException is false/undefined and event is recurring (shows dialog)', function () {
    it('returns cancelled when the user dismisses the dialog (button index 2)', async function () {
      dialogSpy.andReturn(2); // 2 = Cancel

      const event = makeEvent(RECURRING_ICS);
      const result = await modifyEventWithRecurringSupport(
        {
          event,
          originalOccurrenceStart: T_OCC2_START,
          newStart: T_NEW_START,
          newEnd: T_NEW_END,
          isAllDay: false,
          // isException omitted (undefined) — should show dialog
        },
        'move',
        'Daily Standup'
      );

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(Actions.queueTask).not.toHaveBeenCalled();
      // Dialog must have been shown
      expect(dialogSpy.calls.length).toBe(1);
    });

    it('calls createOccurrenceException when dialog returns "this-occurrence" (button index 0)', async function () {
      dialogSpy.andReturn(0); // 0 = This occurrence only

      const event = makeEvent(RECURRING_ICS);
      const result = await modifyEventWithRecurringSupport(
        {
          event,
          originalOccurrenceStart: T_OCC2_START,
          newStart: T_NEW_START,
          newEnd: T_NEW_END,
          isAllDay: false,
        },
        'move',
        'Daily Standup'
      );

      expect(result.success).toBe(true);
      expect(ICSEventHelpers.createRecurrenceException).toHaveBeenCalled();
      expect(ICSEventHelpers.updateRecurringEventTimes).not.toHaveBeenCalled();
    });

    it('calls modifyAllOccurrences when dialog returns "all-occurrences" (button index 1)', async function () {
      dialogSpy.andReturn(1); // 1 = All occurrences

      const event = makeEvent(RECURRING_ICS);
      const result = await modifyEventWithRecurringSupport(
        {
          event,
          originalOccurrenceStart: T_OCC2_START,
          newStart: T_NEW_START,
          newEnd: T_NEW_END,
          isAllDay: false,
        },
        'move',
        'Daily Standup'
      );

      expect(result.success).toBe(true);
      expect(ICSEventHelpers.updateRecurringEventTimes).toHaveBeenCalled();
      expect(ICSEventHelpers.createRecurrenceException).not.toHaveBeenCalled();
    });
  });

  describe('when event is non-recurring (simple update, no dialog)', function () {
    it('calls modifySimpleEvent and returns success without showing dialog', async function () {
      const event = makeEvent(SIMPLE_ICS);
      const result = await modifyEventWithRecurringSupport(
        {
          event,
          originalOccurrenceStart: T_OCC2_START,
          newStart: T_NEW_START,
          newEnd: T_NEW_END,
          isAllDay: false,
        },
        'move',
        'Team Lunch'
      );

      expect(result.success).toBe(true);
      // Simple path uses updateEventTimes (not createRecurrenceException)
      expect(ICSEventHelpers.updateEventTimes).toHaveBeenCalled();
      expect(ICSEventHelpers.createRecurrenceException).not.toHaveBeenCalled();
      // Dialog must NOT have been shown for a non-recurring event
      expect(dialogSpy.calls.length).toBe(0);
    });
  });

  describe('when isException is true but event is a standalone DB exception (event.isRecurrenceException() === true)', function () {
    // A standalone exception is a separate DB record (legacy or server-sent). When the
    // drag handler resolves its ID, CalendarUtils.parseOccurrenceId returns the exception
    // record's ID — so options.event IS the exception, not the master. Calling
    // createOccurrenceException here would try to embed inline into the exception ICS
    // rather than the master. The correct path is modifySimpleEvent (direct ICS update).

    it('routes to modifySimpleEvent, not createOccurrenceException, even when isException is true', async function () {
      // recurrenceId set → event.isRecurrenceException() returns true (standalone DB record)
      const event = makeEvent(STANDALONE_EXCEPTION_ICS, {
        recurrenceId: '20260302T060000Z',
      } as any);
      const result = await modifyEventWithRecurringSupport(
        {
          event,
          originalOccurrenceStart: T_OCC2_START,
          newStart: T_NEW_START,
          newEnd: T_NEW_END,
          isAllDay: false,
          isException: true, // set by drag handler for any EventOccurrence with isException=true
        },
        'move',
        'Daily Standup'
      );

      expect(result.success).toBe(true);
      expect(ICSEventHelpers.updateEventTimes).toHaveBeenCalled();
      expect(ICSEventHelpers.createRecurrenceException).not.toHaveBeenCalled();
      expect(dialogSpy.calls.length).toBe(0);
    });

    it('does not show the dialog for standalone exceptions', async function () {
      const event = makeEvent(STANDALONE_EXCEPTION_ICS, {
        recurrenceId: '20260302T060000Z',
      } as any);
      await modifyEventWithRecurringSupport(
        {
          event,
          originalOccurrenceStart: T_OCC2_START,
          newStart: T_NEW_START,
          newEnd: T_NEW_END,
          isAllDay: false,
          isException: true,
        },
        'move',
        'Daily Standup'
      );

      expect(dialogSpy.calls.length).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// modifySimpleEventProperty
// ---------------------------------------------------------------------------

describe('modifySimpleEventProperty', function () {
  // What Google writes: formatted notes, a location, and a guest list the edit must not touch.
  const FORMATTED_ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    'UID:formatted-uid@test',
    'DTSTART:20260301T140000Z',
    'DTEND:20260301T150000Z',
    'SUMMARY:Team Lunch',
    'LOCATION:Conference Room B',
    'DESCRIPTION:Agenda:<br><b>Budget</b><br><a href="https://example.com/doc">Doc</a>',
    'TRANSP:OPAQUE',
    'DTSTAMP:20260101T000000Z',
    'SEQUENCE:3',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  let queued: jasmine.Spy;
  beforeEach(function () {
    queued = spyOn(Actions, 'queueTask');
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => ({ _opts: opts }));
  });

  const written = (event: MailspringEvent) => CalendarUtils.parseICSString(event.ics).event;

  it('writes only the edited property and revises the event once', function () {
    const event = makeEvent(FORMATTED_ICS);
    const before = written(event);

    modifySimpleEventProperty(event, { property: 'summary', value: 'Team Dinner' });

    const after = written(event);
    expect(after.summary).toBe('Team Dinner');
    expect(after.description).toBe(before.description);
    expect(after.location).toBe(before.location);
    expect(after.component.getFirstPropertyValue('transp')).toBe('OPAQUE');
    expect(after.component.getFirstPropertyValue('sequence')).toBe(4);
  });

  it('adds a repeat rule without touching the rest', function () {
    const event = makeEvent(FORMATTED_ICS);
    const before = written(event);

    modifySimpleEventProperty(event, { property: 'rrule', value: 'FREQ=WEEKLY' });

    const after = written(event);
    expect(String(after.component.getFirstPropertyValue('rrule'))).toBe('FREQ=WEEKLY');
    expect(after.description).toBe(before.description);
    expect(after.summary).toBe('Team Lunch');
  });

  it('queues one update that can undo back to the event as it was', function () {
    const event = makeEvent(FORMATTED_ICS);

    modifySimpleEventProperty(event, { property: 'location', value: 'Room 2' });

    expect(queued.callCount).toBe(1);
    const { _opts } = queued.mostRecentCall.args[0];
    expect(_opts.event).toBe(event);
    expect(_opts.undoData.ics).toBe(FORMATTED_ICS);
  });

  describe('modifySimpleEventChange', function () {
    const NEW_START = Date.UTC(2026, 2, 2, 16, 0) / 1000;
    const NEW_END = Date.UTC(2026, 2, 2, 17, 0) / 1000;

    it('sends the times and every edited property as one update that revises the event once', function () {
      const event = makeEvent(FORMATTED_ICS);
      const before = written(event);

      modifySimpleEventChange(event, {
        times: { start: NEW_START, end: NEW_END, isAllDay: false },
        edits: [
          { property: 'summary', value: 'Team Dinner' },
          { property: 'location', value: 'Room 2' },
        ],
      });

      expect(queued.callCount).toBe(1);
      const after = written(event);
      expect(after.startDate.toJSDate().getTime() / 1000).toBe(NEW_START);
      expect(after.endDate.toJSDate().getTime() / 1000).toBe(NEW_END);
      expect(event.recurrenceStart).toBe(NEW_START);
      expect(event.recurrenceEnd).toBe(NEW_END);
      expect(after.summary).toBe('Team Dinner');
      expect(after.location).toBe('Room 2');
      expect(after.description).toBe(before.description);
      expect(after.component.getFirstPropertyValue('transp')).toBe('OPAQUE');
      expect(after.component.getFirstPropertyValue('sequence')).toBe(4);
      expect(queued.mostRecentCall.args[0]._opts.undoData.ics).toBe(FORMATTED_ICS);
    });
  });
});

// ---------------------------------------------------------------------------
// modifyOccurrenceChange / modifySeriesChange
// ---------------------------------------------------------------------------

describe('changes to a series', function () {
  // A weekly series whose second occurrence was already moved and renamed on its own.
  const SERIES_ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Test//EN',
    'BEGIN:VEVENT',
    'UID:series-uid@test',
    'DTSTART:20260302T150000Z',
    'DTEND:20260302T160000Z',
    'RRULE:FREQ=WEEKLY;COUNT=6',
    'SUMMARY:Interview',
    'LOCATION:Room 1',
    'DTSTAMP:20260101T000000Z',
    'SEQUENCE:2',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:series-uid@test',
    'RECURRENCE-ID:20260309T150000Z',
    'DTSTART:20260309T170000Z',
    'DTEND:20260309T180000Z',
    'SUMMARY:Interview with Alex',
    'LOCATION:Room 1',
    'DTSTAMP:20260101T000000Z',
    'SEQUENCE:5',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const unix = (iso: string) => Date.parse(iso) / 1000;
  const MOVED_SLOT = unix('2026-03-09T15:00:00Z');
  const THIRD_SLOT = unix('2026-03-16T15:00:00Z');

  let queued: jasmine.Spy;
  beforeEach(function () {
    queued = spyOn(Actions, 'queueTask');
    spyOn(SyncbackEventTask, 'forUpdating').andCallFake((opts) => ({ _opts: opts }));
  });

  const vevents = (ics: string) =>
    CalendarUtils.parseICSString(ics).root.getAllSubcomponents('vevent') as any[];
  const master = (ics: string) => vevents(ics).find((v) => !v.getFirstProperty('recurrence-id'));
  const at = (ics: string, slot: number) =>
    vevents(ics).find(
      (v) => v.getFirstPropertyValue('recurrence-id')?.toJSDate().getTime() / 1000 === slot
    );
  const startOf = (vevent: any) =>
    vevent.getFirstPropertyValue('dtstart').toJSDate().getTime() / 1000;

  it('keeps what an occurrence changed before and counts its SEQUENCE up from its own', function () {
    const event = makeEvent(SERIES_ICS);

    modifyOccurrenceChange(event, MOVED_SLOT, {
      times: {
        start: unix('2026-03-09T18:00:00Z'),
        end: unix('2026-03-09T19:00:00Z'),
        isAllDay: false,
      },
      edits: [{ property: 'location', value: 'Room 2' }],
    });

    const occurrence = at(event.ics, MOVED_SLOT);
    expect(occurrence.getFirstPropertyValue('summary')).toBe('Interview with Alex');
    expect(occurrence.getFirstPropertyValue('location')).toBe('Room 2');
    expect(occurrence.getFirstPropertyValue('sequence')).toBe(6);
    expect(vevents(event.ics).length).toBe(2);
  });

  it('writes this occurrence only to its own VEVENT, revising it alone', function () {
    const event = makeEvent(SERIES_ICS);
    const third = { start: THIRD_SLOT, end: THIRD_SLOT + 3600, isAllDay: false };

    modifyOccurrenceChange(event, THIRD_SLOT, {
      times: third,
      edits: [
        { property: 'summary', value: 'Interview with Jordan' },
        { property: 'transp', value: 'TRANSPARENT' },
      ],
    });

    expect(queued.callCount).toBe(1);
    const occurrence = at(event.ics, THIRD_SLOT);
    expect(occurrence.getFirstPropertyValue('summary')).toBe('Interview with Jordan');
    expect(occurrence.getFirstPropertyValue('transp')).toBe('TRANSPARENT');
    expect(occurrence.getFirstPropertyValue('location')).toBe('Room 1');
    expect(startOf(occurrence)).toBe(THIRD_SLOT);
    expect(occurrence.getFirstPropertyValue('sequence')).toBe(3);
    const series = master(event.ics);
    expect(series.getFirstPropertyValue('summary')).toBe('Interview');
    expect(series.getFirstPropertyValue('sequence')).toBe(2);
    expect(at(event.ics, MOVED_SLOT).getFirstPropertyValue('sequence')).toBe(5);
  });

  it("writes all occurrences to the series, moving it and the moved occurrence's slot with it", function () {
    const event = makeEvent(SERIES_ICS);
    const hourLater = 3600;

    modifySeriesChange(event, THIRD_SLOT, {
      times: { start: THIRD_SLOT + hourLater, end: THIRD_SLOT + 2 * hourLater, isAllDay: false },
      edits: [
        { property: 'summary', value: 'Interview loop' },
        { property: 'rrule', value: 'FREQ=DAILY' },
      ],
    });

    expect(queued.callCount).toBe(1);
    const series = master(event.ics);
    expect(series.getFirstPropertyValue('summary')).toBe('Interview loop');
    expect(String(series.getFirstPropertyValue('rrule'))).toBe('FREQ=DAILY');
    expect(startOf(series)).toBe(unix('2026-03-02T16:00:00Z'));
    expect(series.getFirstPropertyValue('sequence')).toBe(3);
    const moved = at(event.ics, MOVED_SLOT + hourLater);
    expect(startOf(moved)).toBe(unix('2026-03-09T17:00:00Z'));
    expect(moved.getFirstPropertyValue('sequence')).toBe(5);
  });
});
