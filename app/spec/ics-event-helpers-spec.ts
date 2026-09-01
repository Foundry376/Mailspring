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

  describe('with a DATE-valued RECURRENCE-ID', function () {
    // A daily all-day series with one inline exception on the 15th
    const ALLDAY_WITH_EXCEPTION = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:allday-series',
      'SUMMARY:Standup',
      'DTSTART;VALUE=DATE:20260310',
      'DTEND;VALUE=DATE:20260311',
      'RRULE:FREQ=DAILY',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:allday-series',
      'SUMMARY:Standup (moved)',
      'RECURRENCE-ID;VALUE=DATE:20260315',
      'DTSTART;VALUE=DATE:20260318',
      'DTEND;VALUE=DATE:20260319',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const HOUR_MS = 3600000;

    // The master shifts by whole calendar days, so the RECURRENCE-ID must too. Adding a
    // 23h delta to a date would land inside the same day and detach the exception.
    it('moves a whole day on a 23-hour (spring-forward) delta', function () {
      const shifted = ICSEventHelpers.shiftInlineExceptions(ALLDAY_WITH_EXCEPTION, 23 * HOUR_MS);
      expect(shifted).toContain('RECURRENCE-ID;VALUE=DATE:20260316');
      expect(shifted).not.toContain('RECURRENCE-ID;VALUE=DATE:20260315');
    });

    // Passes with a raw ms delta too — 25h lands on the right day before truncation. Kept
    // as a boundary case, not as a guard; only the 23-hour test above discriminates.
    it('moves a whole day on a 25-hour delta', function () {
      const shifted = ICSEventHelpers.shiftInlineExceptions(ALLDAY_WITH_EXCEPTION, 25 * HOUR_MS);
      expect(shifted).toContain('RECURRENCE-ID;VALUE=DATE:20260316');
    });

    it('moves a whole day on an exact 24-hour delta (true under either arithmetic)', function () {
      const shifted = ICSEventHelpers.shiftInlineExceptions(ALLDAY_WITH_EXCEPTION, 24 * HOUR_MS);
      expect(shifted).toContain('RECURRENCE-ID;VALUE=DATE:20260316');
    });

    it('moves backward a whole day on a negative 23-hour delta', function () {
      const shifted = ICSEventHelpers.shiftInlineExceptions(ALLDAY_WITH_EXCEPTION, -23 * HOUR_MS);
      expect(shifted).toContain('RECURRENCE-ID;VALUE=DATE:20260314');
    });

    it('keeps the RECURRENCE-ID DATE-typed rather than adding a time', function () {
      const shifted = ICSEventHelpers.shiftInlineExceptions(ALLDAY_WITH_EXCEPTION, 23 * HOUR_MS);
      expect(shifted).not.toMatch(/RECURRENCE-ID(?!;VALUE=DATE)/);
    });

    it("leaves the exception's own DTSTART alone", function () {
      const shifted = ICSEventHelpers.shiftInlineExceptions(ALLDAY_WITH_EXCEPTION, 23 * HOUR_MS);
      expect(shifted).toContain('DTSTART;VALUE=DATE:20260318');
    });
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

  it('applies a resize to the whole series (extends the master duration)', function () {
    // Resize the 2nd occurrence from 1h to 2h: start unchanged, end +1h. Before the fix newEnd
    // was ignored and the master stayed 1h (07:00); now it becomes 2h (08:00).
    const T_RESIZE_END = Date.UTC(2026, 2, 2, 8, 0, 0) / 1000; // 20260302T080000Z (2h span)
    const result = ICSEventHelpers.updateRecurringEventTimes(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_OCC2_START, // no move
      T_RESIZE_END,
      false
    );
    expect(result).toContain('20260301T060000Z'); // DTSTART unchanged
    expect(result).toContain('20260301T080000Z'); // DTEND now 2h after start
    expect(result).not.toContain('20260301T070000Z'); // old 1h end gone
  });

  it('applies a combined move and resize', function () {
    // Move +2h AND resize to 3h: newStart 08:00, newEnd 11:00.
    const T_MR_START = Date.UTC(2026, 2, 2, 8, 0, 0) / 1000;
    const T_MR_END = Date.UTC(2026, 2, 2, 11, 0, 0) / 1000;
    const result = ICSEventHelpers.updateRecurringEventTimes(
      DAILY_STANDUP_ICS,
      T_OCC2_START,
      T_MR_START,
      T_MR_END,
      false
    );
    expect(result).toContain('20260301T080000Z'); // DTSTART shifted +2h
    expect(result).toContain('20260301T110000Z'); // DTEND = new start + 3h
  });

  // These pin the calendar-day SEMANTICS (whole-day moves, exclusive DTEND, month rollover)
  // but not the DST behaviour: this module does plain-Date local arithmetic, which
  // moment.tz.setDefault cannot redirect, and in CI's UTC a whole-day shift is exactly
  // 86400s either way. Verified by hand across Chicago/Santiago/Havana/Beirut instead.
  describe('for an all-day series', function () {
    // A yearly all-day holiday. DTEND is exclusive, so 21st→22nd is a single day.
    const YEARLY_ALLDAY_ICS = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:holiday-1',
      'SUMMARY:Midsummer',
      'DTSTART;VALUE=DATE:20260621',
      'DTEND;VALUE=DATE:20260622',
      'RRULE:FREQ=YEARLY',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    // All-day occurrence times are local midnights, the way the calendar produces them
    const localMidnight = (y: number, m: number, d: number) =>
      new Date(y, m - 1, d).getTime() / 1000;

    it('moves the master forward by whole days, keeping DATE values', function () {
      const result = ICSEventHelpers.updateRecurringEventTimes(
        YEARLY_ALLDAY_ICS,
        localMidnight(2026, 6, 21),
        localMidnight(2026, 6, 22),
        localMidnight(2026, 6, 23),
        true
      );
      expect(result).toContain('DTSTART;VALUE=DATE:20260622');
      expect(result).toContain('DTEND;VALUE=DATE:20260623');
    });

    it('moves the master backward by whole days', function () {
      const result = ICSEventHelpers.updateRecurringEventTimes(
        YEARLY_ALLDAY_ICS,
        localMidnight(2026, 6, 21),
        localMidnight(2026, 6, 19),
        localMidnight(2026, 6, 20),
        true
      );
      expect(result).toContain('DTSTART;VALUE=DATE:20260619');
      expect(result).toContain('DTEND;VALUE=DATE:20260620');
    });

    it('leaves a zero-day move alone rather than drifting the dates', function () {
      const result = ICSEventHelpers.updateRecurringEventTimes(
        YEARLY_ALLDAY_ICS,
        localMidnight(2026, 6, 21),
        localMidnight(2026, 6, 21),
        localMidnight(2026, 6, 22),
        true
      );
      expect(result).toContain('DTSTART;VALUE=DATE:20260621');
      expect(result).toContain('DTEND;VALUE=DATE:20260622');
    });

    it('resizes the series to a longer span', function () {
      // Extend the 1-day holiday to 3 days (no move). Before the fix newEnd was ignored and it
      // stayed 1 day; now the exclusive DTEND moves out to cover three days.
      const result = ICSEventHelpers.updateRecurringEventTimes(
        YEARLY_ALLDAY_ICS,
        localMidnight(2026, 6, 21),
        localMidnight(2026, 6, 21), // no move
        localMidnight(2026, 6, 24), // 3-day span (exclusive end)
        true
      );
      expect(result).toContain('DTSTART;VALUE=DATE:20260621');
      expect(result).toContain('DTEND;VALUE=DATE:20260624');
    });

    it('carries the move across a month boundary', function () {
      const result = ICSEventHelpers.updateRecurringEventTimes(
        YEARLY_ALLDAY_ICS,
        localMidnight(2026, 6, 21),
        localMidnight(2026, 7, 1),
        localMidnight(2026, 7, 2),
        true
      );
      expect(result).toContain('DTSTART;VALUE=DATE:20260701');
      expect(result).toContain('DTEND;VALUE=DATE:20260702');
    });

    it('preserves the RRULE', function () {
      const result = ICSEventHelpers.updateRecurringEventTimes(
        YEARLY_ALLDAY_ICS,
        localMidnight(2026, 6, 21),
        localMidnight(2026, 6, 22),
        localMidnight(2026, 6, 23),
        true
      );
      expect(result).toContain('FREQ=YEARLY');
    });

    it('keeps a multi-day span the same length', function () {
      const THREE_DAY_ICS = YEARLY_ALLDAY_ICS.replace(
        'DTEND;VALUE=DATE:20260622',
        'DTEND;VALUE=DATE:20260624'
      );
      const result = ICSEventHelpers.updateRecurringEventTimes(
        THREE_DAY_ICS,
        localMidnight(2026, 6, 21),
        localMidnight(2026, 6, 28),
        localMidnight(2026, 7, 1),
        true
      );
      expect(result).toContain('DTSTART;VALUE=DATE:20260628');
      expect(result).toContain('DTEND;VALUE=DATE:20260701');
    });
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

// ---------------------------------------------------------------------------
// All-day DTEND is exclusive (RFC 5545): midnight of the day AFTER the last day
// covered. Timestamps below are local midnights, because all-day times are built
// from local date components — a UTC midnight would land on the previous day in
// any negative-offset zone.
// ---------------------------------------------------------------------------

const ALL_DAY_SIMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:all-day-simple@test
DTSTART;VALUE=DATE:20260622
DTEND;VALUE=DATE:20260623
SUMMARY:Company Holiday
DTSTAMP:20260101T000000Z
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

/** Local midnight, as unix seconds */
function localDay(year: number, month1Indexed: number, day: number): number {
  return new Date(year, month1Indexed - 1, day).getTime() / 1000;
}

/** Extract the YYYYMMDD from a DATE-valued property */
function getDateOnly(ics: string, propName: string): string | null {
  const match = new RegExp(`^${propName.toUpperCase()}[^:]*:(\\d{8})\\s*$`, 'im').exec(ics);
  return match ? match[1] : null;
}

describe('ICSEventHelpers.updateEventTimes with all-day events', function () {
  it('keeps an already-exclusive end unchanged', function () {
    const result = ICSEventHelpers.updateEventTimes(ALL_DAY_SIMPLE_ICS, {
      start: localDay(2026, 6, 22),
      end: localDay(2026, 6, 23),
      isAllDay: true,
    });
    expect(getDateOnly(result, 'DTSTART')).toBe('20260622');
    expect(getDateOnly(result, 'DTEND')).toBe('20260623');
  });

  it('converts an inclusive end-of-day end to the next day', function () {
    const result = ICSEventHelpers.updateEventTimes(ALL_DAY_SIMPLE_ICS, {
      start: localDay(2026, 6, 22),
      end: localDay(2026, 6, 23) - 1, // 23:59:59 on the 22nd
      isAllDay: true,
    });
    expect(getDateOnly(result, 'DTSTART')).toBe('20260622');
    expect(getDateOnly(result, 'DTEND')).toBe('20260623');
  });

  it('gives a degenerate end (equal to start) a full day', function () {
    const result = ICSEventHelpers.updateEventTimes(ALL_DAY_SIMPLE_ICS, {
      start: localDay(2026, 6, 22),
      end: localDay(2026, 6, 22),
      isAllDay: true,
    });
    expect(getDateOnly(result, 'DTEND')).toBe('20260623');
  });

  it('gives a same-day timed range a full day, as the popover all-day toggle produces', function () {
    const result = ICSEventHelpers.updateEventTimes(ALL_DAY_SIMPLE_ICS, {
      start: localDay(2026, 6, 22) + 10 * 3600, // 10:00
      end: localDay(2026, 6, 22) + 11 * 3600, // 11:00
      isAllDay: true,
    });
    expect(getDateOnly(result, 'DTSTART')).toBe('20260622');
    expect(getDateOnly(result, 'DTEND')).toBe('20260623');
  });

  it('preserves a multi-day span', function () {
    const result = ICSEventHelpers.updateEventTimes(ALL_DAY_SIMPLE_ICS, {
      start: localDay(2026, 6, 20),
      end: localDay(2026, 6, 23), // covers the 20th, 21st, 22nd
      isAllDay: true,
    });
    expect(getDateOnly(result, 'DTSTART')).toBe('20260620');
    expect(getDateOnly(result, 'DTEND')).toBe('20260623');
  });

  it('rolls over month and year boundaries', function () {
    const endOfMonth = ICSEventHelpers.updateEventTimes(ALL_DAY_SIMPLE_ICS, {
      start: localDay(2026, 6, 30),
      end: localDay(2026, 6, 30),
      isAllDay: true,
    });
    expect(getDateOnly(endOfMonth, 'DTEND')).toBe('20260701');

    const endOfYear = ICSEventHelpers.updateEventTimes(ALL_DAY_SIMPLE_ICS, {
      start: localDay(2026, 12, 31),
      end: localDay(2026, 12, 31),
      isAllDay: true,
    });
    expect(getDateOnly(endOfYear, 'DTEND')).toBe('20270101');
  });

  it('never emits a zero-length all-day event', function () {
    const ends = [
      localDay(2026, 6, 22),
      localDay(2026, 6, 22) + 1,
      localDay(2026, 6, 23) - 1,
      localDay(2026, 6, 23),
    ];
    ends.forEach((end) => {
      const result = ICSEventHelpers.updateEventTimes(ALL_DAY_SIMPLE_ICS, {
        start: localDay(2026, 6, 22),
        end,
        isAllDay: true,
      });
      const dtstart = getDateOnly(result, 'DTSTART');
      const dtend = getDateOnly(result, 'DTEND');
      // Assert both parsed, or a DATE-TIME regression on one side would pass
      expect(dtstart).toBe('20260622');
      expect(dtend).toBe('20260623');
    });
  });
});

// ---------------------------------------------------------------------------
// Expansion budget. ical-expander iterates forward from DTSTART with no way to seek, so a
// fixed cap is a limit on how far back a series may begin. At 100 a weekly meeting older
// than about two years expanded to nothing and disappeared from the calendar.
// ---------------------------------------------------------------------------

describe('ICSEventHelpers.expansionIterationBudget', function () {
  const series = (rrule: string, dtstart = '20220308T130000Z') =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      // A VTIMEZONE first, with its own RRULEs - this is what a real Google calendar sends.
      'BEGIN:VTIMEZONE',
      'TZID:America/Indiana/Indianapolis',
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:-0500',
      'TZOFFSETTO:-0400',
      'TZNAME:EDT',
      'DTSTART:19700308T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
      'END:DAYLIGHT',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:series@test',
      'DTSTAMP:20220308T000000Z',
      `DTSTART:${dtstart}`,
      'DTEND:20220308T132000Z',
      `RRULE:${rrule}`,
      'SUMMARY:Standup',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

  const START = Date.UTC(2022, 2, 8, 13, 0, 0) / 1000;
  const NOW = Date.UTC(2026, 7, 28, 0, 0, 0) / 1000;

  const budgetFor = (rrule: string, start: any = START, end: any = NOW) =>
    ICSEventHelpers.expansionIterationBudget(series(rrule), start, end);

  // A weekly series over this span needs 334 steps and a yearly one 105, both of which floor
  // to MIN - so a weekly fixture cannot tell the VEVENT's rule from the VTIMEZONE's. Daily
  // needs more than the floor, which is what makes these assertions discriminating.
  const DAY = 86400;
  const WEEK = 7 * DAY;
  const FLOOR = 1000;

  it("reads the event's RRULE, not the VTIMEZONE's DST rule", function () {
    // The DAYLIGHT block's FREQ=YEARLY comes first in the file, so a plain search for the
    // first RRULE reads it and derives 105 - indistinguishable from any other floored
    // result. The event's own daily rule derives well above the floor.
    const daily = budgetFor('FREQ=DAILY');
    expect(daily).toBe(Math.ceil((NOW - START) / DAY) + 100);
    expect(daily).toBeGreaterThan(FLOOR);
    // Same file shape and dates, so the difference comes only from which rule was read.
    expect(budgetFor('FREQ=YEARLY;BYMONTH=3')).toBe(FLOOR);
  });

  it('budgets enough steps to reach the end of the window', function () {
    // The old fixed cap of 100 is about two years of weekly steps and stopped in early 2024.
    expect(budgetFor('FREQ=WEEKLY;BYDAY=TU')).toBeGreaterThan(Math.ceil((NOW - START) / WEEK));
    // Daily needs 1634, more than the floor supplies, so this asserts the derivation itself.
    const daily = budgetFor('FREQ=DAILY');
    expect(daily).toBeGreaterThan(Math.ceil((NOW - START) / DAY));
    expect(daily).toBeGreaterThan(budgetFor('FREQ=WEEKLY;BYDAY=TU'));
  });

  it('returns the floor when the series has no usable start', function () {
    // recurrenceStart can be null or non-finite. A NaN budget is worse than a small one:
    // it survives Math.max/Math.min and ical-expander reads `!this.maxIterations` as no cap,
    // so an abusive rule iterates unbounded instead of being truncated.
    // Passed positionally rather than through budgetFor, whose defaults would swallow
    // undefined and quietly test a finite start instead.
    const abusive = series('FREQ=SECONDLY');
    [null, undefined, NaN, Infinity, -Infinity].forEach((noStart) => {
      expect(ICSEventHelpers.expansionIterationBudget(abusive, noStart as any, NOW)).toBe(FLOOR);
    });
    expect(ICSEventHelpers.expansionIterationBudget(series('FREQ=DAILY'), START, NaN)).toBe(FLOOR);
  });

  it('accounts for INTERVAL, which stretches how far each step reaches', function () {
    expect(budgetFor('FREQ=DAILY')).toBeGreaterThan(budgetFor('FREQ=DAILY;INTERVAL=3'));
  });

  it('caps a frequency fine enough to be abusive rather than spinning', function () {
    // An invitation is untrusted input; FREQ=SECONDLY dated years back would otherwise
    // iterate essentially forever.
    expect(budgetFor('FREQ=SECONDLY')).toBe(50000);
  });

  it('returns the floor for an event that does not recur at all', function () {
    // Strip the VEVENT's own rule rather than the first RRULE in the file - that one belongs
    // to the VTIMEZONE, and removing it leaves a weekly series that floors to the same value.
    const ics = series('FREQ=WEEKLY').replace('\r\nRRULE:FREQ=WEEKLY', '');
    expect(/BEGIN:VEVENT[\s\S]*RRULE:/.test(ics)).toBe(false);
    expect(ICSEventHelpers.expansionIterationBudget(ics, START, NOW)).toBe(FLOOR);
  });
});
