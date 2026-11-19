import DateUtils from '../src/date-utils';
import { use24HourClock } from './fixtures/use-24-hour-clock';

// 03:00 UTC is the previous evening in Chicago and noon in Tokyo, and over a year old whatever
// "now" is, so it formats as month, day and year in both zones.
const instant = new Date(Date.UTC(2020, 0, 15, 3, 0));

// 06:30 UTC in July is just after midnight in Denver (UTC-6 then) and the previous evening in
// Phoenix (UTC-7 all year). In winter both zones are UTC-7.
const julyInstant = new Date(Date.UTC(2020, 6, 15, 6, 30));

describe('DateUtils.shortTimeString', function () {
  const originalTZ = process.env.TZ;

  beforeEach(() => use24HourClock(false));

  afterEach(() => {
    // Assigning undefined would store the string "undefined", which ICU reads as UTC.
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  });

  it('reuses its formatter while the host zone stays the same', function () {
    DateUtils.shortTimeString(instant);
    spyOn(Intl, 'DateTimeFormat').andCallThrough();
    DateUtils.shortTimeString(instant);
    DateUtils.shortTimeString(instant);
    expect(Intl.DateTimeFormat).not.toHaveBeenCalled();
  });

  it('formats in the new zone after the host zone changes', function () {
    process.env.TZ = 'America/Chicago';
    expect(DateUtils.shortTimeString(instant)).toBe('Jan 14, 2020');

    // A laptop waking in Tokyo. Assigning TZ makes V8 re-read the host zone.
    process.env.TZ = 'Asia/Tokyo';
    expect(DateUtils.shortTimeString(instant)).toBe('Jan 15, 2020');
  });

  it('formats in the new zone after a move to a zone with different DST rules', function () {
    process.env.TZ = 'America/Denver';
    expect(DateUtils.shortTimeString(julyInstant)).toBe('Jul 15, 2020');

    process.env.TZ = 'America/Phoenix';
    expect(DateUtils.shortTimeString(julyInstant)).toBe('Jul 14, 2020');
  });

  it('builds new formatters when the host offset changes', function () {
    DateUtils.shortTimeString(instant);
    const otherOffset = new Date().getTimezoneOffset() + 60;
    spyOn(Date.prototype, 'getTimezoneOffset').andReturn(otherOffset);
    spyOn(Intl, 'DateTimeFormat').andCallThrough();
    DateUtils.shortTimeString(instant);
    expect(Intl.DateTimeFormat).toHaveBeenCalled();
  });
});
