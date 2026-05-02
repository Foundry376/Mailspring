import * as ICSEventHelpers from '../src/ics-event-helpers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAILY_STANDUP_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-uid-123@test
DTSTART:20260301T060000Z
DTEND:20260301T070000Z
RRULE:FREQ=DAILY;COUNT=10
SUMMARY:Daily Standup
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

// All-day recurring event (DATE values, no time component)
const ALL_DAY_RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:all-day-uid@test
DTSTART;VALUE=DATE:20260301
DTEND;VALUE=DATE:20260302
RRULE:FREQ=WEEKLY;COUNT=5
SUMMARY:Weekly All Day
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

// Simple (non-recurring) event
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

// Recurring event with an existing inline exception already embedded
const RECURRING_WITH_EXCEPTION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:master-uid@test
DTSTART:20260301T060000Z
DTEND:20260301T070000Z
RRULE:FREQ=DAILY;COUNT=5
SUMMARY:Morning Sync
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
BEGIN:VEVENT
UID:master-uid@test
RECURRENCE-ID:20260302T060000Z
DTSTART:20260302T080000Z
DTEND:20260302T090000Z
SUMMARY:Morning Sync (moved)
DTSTAMP:20260101T000000Z
SEQUENCE:1
END:VEVENT
END:VCALENDAR`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count how many VEVENT blocks appear in an ICS string. */
function countVevents(ics: string): number {
  return (ics.match(/^BEGIN:VEVENT$/gm) || []).length;
}

/** Return true if a property line appears in the ICS string (case-insensitive key). */
function hasProperty(ics: string, propName: string): boolean {
  return new RegExp(`^${propName.toUpperCase()}`, 'im').test(ics);
}

/** Return the value of the first occurrence of a property (e.g. "RECURRENCE-ID:..."). */
function getPropertyValue(ics: string, propName: string): string | null {
  const match = new RegExp(`^${propName.toUpperCase()}[;:](.+)$`, 'im').exec(ics);
  return match ? match[1].trim() : null;
}

// Recurring event whose existing exception uses RECURRENCE-ID in *TZID format*
// (e.g., produced by a CalDAV server or an older code path).
// This mirrors the real-world bug where re-editing such an exception left a
// duplicate VEVENT in the ICS because the old string-based upsert comparison
// failed to recognise "RECURRENCE-ID;TZID=America/Chicago:20260312T140000" as
// the same moment as our UTC-format "RECURRENCE-ID:20260312T190000Z".
//
// Timeline: DST starts March 8 2026 in the US (2nd Sunday of March).
// From March 9 onwards America/Chicago = CDT (UTC−5).
// March 12 14:00 CDT  =  March 12 19:00 UTC  (= T_MARCH12_CDT_AS_UTC below).
const RECURRING_WITH_TZID_EXCEPTION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTIMEZONE
TZID:America/Chicago
BEGIN:DAYLIGHT
TZNAME:CDT
TZOFFSETFROM:-0600
TZOFFSETTO:-0500
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZNAME:CST
TZOFFSETFROM:-0500
TZOFFSETTO:-0600
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:3pm-every-day@test
DTSTART;TZID=America/Chicago:20260309T140000
DTEND;TZID=America/Chicago:20260309T150000
RRULE:FREQ=DAILY
SUMMARY:3PM EVERY DY
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
BEGIN:VEVENT
UID:3pm-every-day@test
RECURRENCE-ID;TZID=America/Chicago:20260312T140000
DTSTART;TZID=America/Chicago:20260312T150000
DTEND;TZID=America/Chicago:20260312T160000
SUMMARY:3PM EVERY DY
DTSTAMP:20260101T000000Z
SEQUENCE:1
END:VEVENT
END:VCALENDAR`;

// ---------------------------------------------------------------------------
// Unix timestamps used across tests
// ---------------------------------------------------------------------------

// 2026-03-01 06:00 UTC  (master DTSTART)
const T_MASTER_START = Date.UTC(2026, 2, 1, 6, 0, 0) / 1000; // 1740805200

// 2026-03-02 06:00 UTC  (second occurrence of the daily standup)
const T_OCC2_START = Date.UTC(2026, 2, 2, 6, 0, 0) / 1000;
const T_OCC2_END = Date.UTC(2026, 2, 2, 7, 0, 0) / 1000;

// New times for the moved exception
const T_NEW_START = Date.UTC(2026, 2, 2, 8, 0, 0) / 1000; // 08:00 UTC
const T_NEW_END = Date.UTC(2026, 2, 2, 9, 0, 0) / 1000; // 09:00 UTC

// ---------------------------------------------------------------------------
// createRecurrenceException
// ---------------------------------------------------------------------------

describe('ICSEventHelpers.createRecurrenceException', function () {
  it('returns both masterIcs and recurrenceId', function () {
    const result = ICSEventHelpers.createRecurrenceException(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
    expect(typeof result.masterIcs).toBe('string');
    expect(typeof result.recurrenceId).toBe('string');
    expect(result.masterIcs.length).toBeGreaterThan(0);
    expect(result.recurrenceId.length).toBeGreaterThan(0);
  });

  it('embeds exactly two VEVENTs in the returned masterIcs (master + exception)', function () {
    const { masterIcs } = ICSEventHelpers.createRecurrenceException(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
    expect(countVevents(masterIcs)).toBe(2);
  });

  it('preserves the RRULE on the master VEVENT', function () {
    const { masterIcs } = ICSEventHelpers.createRecurrenceException(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
    expect(hasProperty(masterIcs, 'RRULE')).toBe(true);
  });

  it('does NOT add RRULE to the exception VEVENT', function () {
    const { masterIcs } = ICSEventHelpers.createRecurrenceException(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
    // There should be exactly one RRULE line (on the master only)
    const rruleMatches = masterIcs.match(/^RRULE:/gim) || [];
    expect(rruleMatches.length).toBe(1);
  });

  it('produces a RECURRENCE-ID in UTC format (YYYYMMDDTHHMMSSz) for timed events', function () {
    const { recurrenceId } = ICSEventHelpers.createRecurrenceException(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
    // Should match 20260302T060000Z
    expect(/^\d{8}T\d{6}Z$/.test(recurrenceId)).toBe(true);
    expect(recurrenceId).toBe('20260302T060000Z');
  });

  it('produces a RECURRENCE-ID in date-only format (YYYYMMDD) for all-day events', function () {
    const allDayOccStart = Date.UTC(2026, 2, 8) / 1000; // 2026-03-08
    const allDayNewStart = Date.UTC(2026, 2, 9) / 1000;
    const allDayNewEnd = Date.UTC(2026, 2, 10) / 1000;

    const { recurrenceId } = ICSEventHelpers.createRecurrenceException(
      ALL_DAY_RECURRING_ICS,
      allDayOccStart,
      allDayNewStart,
      allDayNewEnd,
      true
    );
    // Should be pure digits — YYYYMMDD
    expect(/^\d{8}$/.test(recurrenceId)).toBe(true);
  });

  it('embeds a RECURRENCE-ID property inside the returned masterIcs', function () {
    const { masterIcs } = ICSEventHelpers.createRecurrenceException(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
    expect(hasProperty(masterIcs, 'RECURRENCE-ID')).toBe(true);
  });

  describe('upsert semantics', function () {
    it('replaces an existing exception when called again with the same originalOccurrenceStart', function () {
      // First call — create the exception
      const { masterIcs: firstMasterIcs } = ICSEventHelpers.createRecurrenceException(
        DAILY_STANDUP_ICS,
        T_OCC2_START,
        T_NEW_START,
        T_NEW_END,
        false
      );

      // Second call on the already-modified masterIcs — should replace, not duplicate
      const T_SECOND_NEW_START = Date.UTC(2026, 2, 2, 10, 0, 0) / 1000;
      const T_SECOND_NEW_END = Date.UTC(2026, 2, 2, 11, 0, 0) / 1000;

      const { masterIcs: secondMasterIcs } = ICSEventHelpers.createRecurrenceException(
        firstMasterIcs,
        T_OCC2_START,
        T_SECOND_NEW_START,
        T_SECOND_NEW_END,
        false
      );

      // Still exactly 2 VEVENTs — no duplicate exception
      expect(countVevents(secondMasterIcs)).toBe(2);
    });
  });

  describe('deep clone isolation', function () {
    it('mutation of the exception VEVENT does not corrupt the master VEVENT', function () {
      const { masterIcs } = ICSEventHelpers.createRecurrenceException(
        DAILY_STANDUP_ICS,
        T_OCC2_START,
        T_NEW_START,
        T_NEW_END,
        false
      );

      // The master VEVENT (first VEVENT block) must still have RRULE
      const firstVeventBlock = masterIcs.split(/BEGIN:VEVENT/i).slice(1)[0]; // skip the prefix before the first VEVENT // first VEVENT block contents

      expect(/^RRULE:/im.test(firstVeventBlock)).toBe(true);
      // The first VEVENT must NOT have a RECURRENCE-ID
      expect(/^RECURRENCE-ID/im.test(firstVeventBlock)).toBe(false);
    });
  });

  describe('with an existing inline exception (upsert on pre-excepted ICS)', function () {
    it('still produces exactly 2 VEVENTs when re-editing the same occurrence', function () {
      // RECURRING_WITH_EXCEPTION_ICS already has 20260302T060000Z excepted
      const { masterIcs } = ICSEventHelpers.createRecurrenceException(
        RECURRING_WITH_EXCEPTION_ICS,
        T_OCC2_START, // 20260302T060000Z — same as the existing exception
        T_NEW_START,
        T_NEW_END,
        false
      );
      expect(countVevents(masterIcs)).toBe(2);
    });

    it('keeps 3 VEVENTs when creating an exception for a different occurrence', function () {
      // Exception for the third occurrence (20260303T060000Z), not the existing one
      const T_OCC3_START = Date.UTC(2026, 2, 3, 6, 0, 0) / 1000;
      const T_OCC3_NEW_START = Date.UTC(2026, 2, 3, 9, 0, 0) / 1000;
      const T_OCC3_NEW_END = Date.UTC(2026, 2, 3, 10, 0, 0) / 1000;

      const { masterIcs } = ICSEventHelpers.createRecurrenceException(
        RECURRING_WITH_EXCEPTION_ICS,
        T_OCC3_START,
        T_OCC3_NEW_START,
        T_OCC3_NEW_END,
        false
      );
      // master + existing exception + new exception = 3
      expect(countVevents(masterIcs)).toBe(3);
    });
  });

  it('throws when newEnd is before newStart', function () {
    expect(() =>
      ICSEventHelpers.createRecurrenceException(
        DAILY_STANDUP_ICS,
        T_OCC2_START,
        T_NEW_END, // start > end — reversed
        T_NEW_START,
        false
      )
    ).toThrow();
  });

  // -------------------------------------------------------------------------
  // Timezone-aware upsert: TZID-format vs UTC-format RECURRENCE-ID
  // -------------------------------------------------------------------------
  // Regression test for the bug where re-editing a TZID-formatted exception
  // left a duplicate VEVENT in the ICS, causing ical-expander to pick the old
  // one (with the stale summary) and ignore the new one.
  //
  // Root cause: the old string comparison
  //   "20260312T140000" !== "20260312T190000Z"
  // failed to recognise these as the same moment (14:00 CDT = 19:00 UTC).
  // Fix: compare via toJSDate().getTime() after registering VTIMEZONE.
  describe('timezone-aware upsert (TZID-format RECURRENCE-ID)', function () {
    // March 12 2026 14:00 CDT (UTC-5) = 19:00 UTC
    const T_MARCH12_CDT_AS_UTC = Date.UTC(2026, 2, 12, 19, 0, 0) / 1000;
    const T_MARCH12_NEW_START = Date.UTC(2026, 2, 12, 20, 0, 0) / 1000;
    const T_MARCH12_NEW_END = Date.UTC(2026, 2, 12, 21, 0, 0) / 1000;

    it('produces exactly 2 VEVENTs when originalOccurrenceStart matches a TZID-formatted existing exception', function () {
      // The fixture has RECURRENCE-ID;TZID=America/Chicago:20260312T140000.
      // T_MARCH12_CDT_AS_UTC is the UTC equivalent (19:00Z).
      // The upsert must recognise them as the same moment and replace the old
      // exception — leaving master + 1 new exception = 2 VEVENTs, not 3.
      const { masterIcs } = ICSEventHelpers.createRecurrenceException(
        RECURRING_WITH_TZID_EXCEPTION_ICS,
        T_MARCH12_CDT_AS_UTC,
        T_MARCH12_NEW_START,
        T_MARCH12_NEW_END,
        false
      );
      expect(countVevents(masterIcs)).toBe(2);
    });

    it('removes the TZID-format RECURRENCE-ID and replaces it with UTC format', function () {
      const { masterIcs, recurrenceId } = ICSEventHelpers.createRecurrenceException(
        RECURRING_WITH_TZID_EXCEPTION_ICS,
        T_MARCH12_CDT_AS_UTC,
        T_MARCH12_NEW_START,
        T_MARCH12_NEW_END,
        false
      );
      // Returned recurrenceId must be UTC
      expect(recurrenceId).toBe('20260312T190000Z');
      // The old TZID-format RECURRENCE-ID must be gone
      expect(masterIcs).not.toContain('RECURRENCE-ID;TZID=America/Chicago:20260312T140000');
      // The new UTC-format RECURRENCE-ID must be present
      expect(masterIcs).toContain('RECURRENCE-ID:20260312T190000Z');
    });

    it('applying a summary edit via applyEditsToException updates only the new exception', function () {
      // This is the exact user-reported scenario: editing the summary of a
      // TZID-format exception should produce an ICS where ical-expander
      // displays the *new* summary, not the old one.
      const { masterIcs, recurrenceId } = ICSEventHelpers.createRecurrenceException(
        RECURRING_WITH_TZID_EXCEPTION_ICS,
        T_MARCH12_CDT_AS_UTC,
        T_MARCH12_NEW_START,
        T_MARCH12_NEW_END,
        false
      );
      const updated = ICSEventHelpers.applyEditsToException(masterIcs, recurrenceId, {
        summary: '3PM EVERY DAY', // the corrected title
      });
      // Updated title must appear (exception VEVENT)
      expect(updated).toContain('3PM EVERY DAY');
      // Original master title must still be present
      expect(updated).toContain('3PM EVERY DY');
      // No duplicate VEVENTs
      expect(countVevents(updated)).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// applyEditsToException
// ---------------------------------------------------------------------------

describe('ICSEventHelpers.applyEditsToException', function () {
  let masterIcsWithException: string;
  let recurrenceId: string;

  beforeEach(function () {
    const result = ICSEventHelpers.createRecurrenceException(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
    masterIcsWithException = result.masterIcs;
    recurrenceId = result.recurrenceId;
  });

  it('updates the summary on the exception VEVENT', function () {
    const updated = ICSEventHelpers.applyEditsToException(masterIcsWithException, recurrenceId, {
      summary: 'Exception Summary',
    });
    // The updated ICS must contain the new summary
    expect(updated).toContain('Exception Summary');
    // The master VEVENT summary should still be "Daily Standup"
    expect(updated).toContain('Daily Standup');
  });

  it('updates the location on the exception VEVENT only', function () {
    const updated = ICSEventHelpers.applyEditsToException(masterIcsWithException, recurrenceId, {
      location: 'Conference Room B',
    });
    expect(updated).toContain('Conference Room B');
    // The master (no RECURRENCE-ID) must NOT have a LOCATION — verify it's only on the exception
    // Count LOCATION occurrences — should be exactly 1 (exception only)
    const locationCount = (updated.match(/^LOCATION:/gim) || []).length;
    expect(locationCount).toBe(1);
  });

  it('updates the description on the exception VEVENT', function () {
    const updated = ICSEventHelpers.applyEditsToException(masterIcsWithException, recurrenceId, {
      description: 'Updated description for this occurrence',
    });
    expect(updated).toContain('Updated description for this occurrence');
  });

  it('does not modify the master VEVENT summary when editing the exception summary', function () {
    const updated = ICSEventHelpers.applyEditsToException(masterIcsWithException, recurrenceId, {
      summary: 'Changed Exception Title',
    });
    // Master summary must still be present
    expect(updated).toContain('Daily Standup');
  });

  it('throws when no exception VEVENT with the given RECURRENCE-ID exists', function () {
    const bogusRecurrenceId = '20261231T120000Z';
    expect(() =>
      ICSEventHelpers.applyEditsToException(masterIcsWithException, bogusRecurrenceId, {
        summary: 'Should Throw',
      })
    ).toThrow();
  });

  it('throws when the ICS has no VCALENDAR root', function () {
    // A bare VEVENT (no VCALENDAR wrapper) should trigger an error
    const bareVevent = `BEGIN:VEVENT
UID:bare@test
DTSTART:20260301T060000Z
DTEND:20260301T070000Z
SUMMARY:Bare
END:VEVENT`;
    expect(() =>
      ICSEventHelpers.applyEditsToException(bareVevent, recurrenceId, { summary: 'X' })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// shiftInlineExceptions
// ---------------------------------------------------------------------------

describe('ICSEventHelpers.shiftInlineExceptions', function () {
  let masterIcsWithException: string;
  let originalRecurrenceId: string;

  beforeEach(function () {
    const result = ICSEventHelpers.createRecurrenceException(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
    masterIcsWithException = result.masterIcs;
    originalRecurrenceId = result.recurrenceId; // '20260302T060000Z'
  });

  it('returns the ICS unchanged when deltaMs is 0', function () {
    const result = ICSEventHelpers.shiftInlineExceptions(masterIcsWithException, 0);
    expect(result).toBe(masterIcsWithException);
  });

  it('shifts the RECURRENCE-ID forward by the given delta', function () {
    // Shift forward 1 day = 86400000 ms
    const shifted = ICSEventHelpers.shiftInlineExceptions(masterIcsWithException, 86400000);
    // Original RECURRENCE-ID was 20260302T060000Z → should become 20260303T060000Z
    expect(shifted).toContain('20260303T060000Z');
    expect(shifted).not.toContain('20260302T060000Z');
  });

  it('shifts the RECURRENCE-ID backward by the given delta', function () {
    // Shift backward 1 day = -86400000 ms
    const shifted = ICSEventHelpers.shiftInlineExceptions(masterIcsWithException, -86400000);
    // Should become 20260301T060000Z
    expect(shifted).toContain('20260301T060000Z');
    expect(shifted).not.toContain('20260302T060000Z');
  });

  it('does NOT change the exception DTSTART when shifting RECURRENCE-ID', function () {
    const shifted = ICSEventHelpers.shiftInlineExceptions(masterIcsWithException, 86400000);
    // Exception DTSTART was set to T_NEW_START = 20260302T080000Z — must remain
    expect(shifted).toContain('20260302T080000Z');
  });

  it('does not touch the master VEVENT (the one without RECURRENCE-ID)', function () {
    const shifted = ICSEventHelpers.shiftInlineExceptions(masterIcsWithException, 86400000);
    // Master DTSTART should still be 20260301T060000Z
    expect(shifted).toContain('20260301T060000Z');
    // RRULE must still be present
    expect(hasProperty(shifted, 'RRULE')).toBe(true);
  });

  it('handles ICS with no inline exceptions gracefully (returns it unchanged except dtstamp)', function () {
    // A plain recurring event with no exception VEVENTs
    const shifted = ICSEventHelpers.shiftInlineExceptions(DAILY_STANDUP_ICS, 3600000);
    // Should still be valid ICS with one VEVENT
    expect(countVevents(shifted)).toBe(1);
  });

  it('shifts multiple exceptions independently', function () {
    // Create a second exception (for the 3rd occurrence)
    const T_OCC3_START = Date.UTC(2026, 2, 3, 6, 0, 0) / 1000;
    const T_OCC3_NEW = Date.UTC(2026, 2, 3, 9, 0, 0) / 1000;
    const T_OCC3_NEW_END = Date.UTC(2026, 2, 3, 10, 0, 0) / 1000;

    const { masterIcs: withTwo } = ICSEventHelpers.createRecurrenceException(
      masterIcsWithException,
      T_OCC3_START,
      T_OCC3_NEW,
      T_OCC3_NEW_END,
      false
    );

    expect(countVevents(withTwo)).toBe(3);

    const shifted = ICSEventHelpers.shiftInlineExceptions(withTwo, 86400000);
    // Both RECURRENCE-IDs should be shifted by 1 day
    expect(shifted).toContain('20260303T060000Z'); // was 20260302T060000Z
    expect(shifted).toContain('20260304T060000Z'); // was 20260303T060000Z
    // Old value for first exception should be gone
    expect(shifted).not.toContain('20260302T060000Z');
  });
});

// ---------------------------------------------------------------------------
// addExclusionDate
// ---------------------------------------------------------------------------

describe('ICSEventHelpers.addExclusionDate', function () {
  it('adds an EXDATE property to the master VEVENT', function () {
    const result = ICSEventHelpers.addExclusionDate(DAILY_STANDUP_ICS, T_OCC2_START, false);
    expect(hasProperty(result, 'EXDATE')).toBe(true);
  });

  it('the returned ICS still has the RRULE', function () {
    const result = ICSEventHelpers.addExclusionDate(DAILY_STANDUP_ICS, T_OCC2_START, false);
    expect(hasProperty(result, 'RRULE')).toBe(true);
  });

  it('increments SEQUENCE when the property is present', function () {
    const result = ICSEventHelpers.addExclusionDate(DAILY_STANDUP_ICS, T_OCC2_START, false);
    const seqValue = getPropertyValue(result, 'SEQUENCE');
    expect(seqValue ? parseInt(seqValue, 10) : 0).toBe(1);
  });

  it('does not increment SEQUENCE when the property is absent', function () {
    // ICS without SEQUENCE
    const noSeqIcs = DAILY_STANDUP_ICS.replace(/\r?\nSEQUENCE:0/g, '');
    const result = ICSEventHelpers.addExclusionDate(noSeqIcs, T_OCC2_START, false);
    // Should not crash, and no SEQUENCE should appear
    expect(result).toBeDefined();
  });

  it('handles all-day events (DATE value format)', function () {
    const allDayOccStart = Date.UTC(2026, 2, 8) / 1000;
    const result = ICSEventHelpers.addExclusionDate(ALL_DAY_RECURRING_ICS, allDayOccStart, true);
    expect(hasProperty(result, 'EXDATE')).toBe(true);
  });

  it('can add multiple EXDATE values by calling it multiple times', function () {
    const T_OCC3_START = Date.UTC(2026, 2, 3, 6, 0, 0) / 1000;
    const after1 = ICSEventHelpers.addExclusionDate(DAILY_STANDUP_ICS, T_OCC2_START, false);
    const after2 = ICSEventHelpers.addExclusionDate(after1, T_OCC3_START, false);
    const exdateCount = (after2.match(/^EXDATE/gim) || []).length;
    expect(exdateCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// updateRecurringEventTimes
// ---------------------------------------------------------------------------

describe('ICSEventHelpers.updateRecurringEventTimes', function () {
  it('shifts the master DTSTART by the delta (not to an absolute new time)', function () {
    // originalOccurrenceStart is the 2nd occurrence: 2026-03-02T06:00Z
    // newStart is 2026-03-02T08:00Z → delta = +2h
    // master DTSTART was 2026-03-01T06:00Z → should become 2026-03-01T08:00Z
    const result = ICSEventHelpers.updateRecurringEventTimes(
      DAILY_STANDUP_ICS,
      T_OCC2_START, // 20260302T060000Z
      T_NEW_START, // 20260302T080000Z  (+2h)
      T_NEW_END, // 20260302T090000Z  (+2h)
      false
    );
    // Master DTSTART should be shifted by +2h from original 06:00 → 08:00
    expect(result).toContain('20260301T080000Z');
  });

  it('preserves the RRULE after shifting', function () {
    const result = ICSEventHelpers.updateRecurringEventTimes(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
    expect(hasProperty(result, 'RRULE')).toBe(true);
    expect(result).toContain('FREQ=DAILY');
  });

  it('shifts both DTSTART and DTEND by the same delta', function () {
    // Original DTEND = 20260301T070000Z (1h after DTSTART)
    // After +2h shift: DTSTART = 20260301T080000Z, DTEND = 20260301T090000Z
    const result = ICSEventHelpers.updateRecurringEventTimes(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_NEW_START,
      T_NEW_END,
      false
    );
    expect(result).toContain('20260301T080000Z'); // shifted DTSTART
    expect(result).toContain('20260301T090000Z'); // shifted DTEND
  });

  it('handles a zero delta (returns an equivalent ICS)', function () {
    // originalOccurrenceStart == newStart → delta = 0 → no shift
    const result = ICSEventHelpers.updateRecurringEventTimes(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_OCC2_START, // same → no change
      T_OCC2_END,
      false
    );
    expect(result).toContain('20260301T060000Z'); // master DTSTART unchanged
  });

  it('can shift backward (negative delta)', function () {
    // Move from 06:00 to 04:00 → delta = -2h
    const T_EARLIER_START = Date.UTC(2026, 2, 2, 4, 0, 0) / 1000;
    const T_EARLIER_END = Date.UTC(2026, 2, 2, 5, 0, 0) / 1000;
    const result = ICSEventHelpers.updateRecurringEventTimes(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_EARLIER_START,
      T_EARLIER_END,
      false
    );
    // Master DTSTART was 20260301T060000Z → -2h → 20260301T040000Z
    expect(result).toContain('20260301T040000Z');
  });
});

// ---------------------------------------------------------------------------
// isRecurringEvent
// ---------------------------------------------------------------------------

describe('ICSEventHelpers.isRecurringEvent', function () {
  it('returns true for a recurring event (has RRULE)', function () {
    expect(ICSEventHelpers.isRecurringEvent(DAILY_STANDUP_ICS)).toBe(true);
  });

  it('returns false for a simple (non-recurring) event', function () {
    expect(ICSEventHelpers.isRecurringEvent(SIMPLE_ICS)).toBe(false);
  });
});
