import DateUtils from '../src/date-utils';
import { use24HourClock } from './fixtures/use-24-hour-clock';

// 03:00 UTC is the previous evening in Chicago and noon in Tokyo, and over a year old whatever
// "now" is, so it formats as month, day and year in both zones.
const instant = new Date(Date.UTC(2020, 0, 15, 3, 0));

describe('DateUtils.shortTimeString', function () {
  const originalTZ = process.env.TZ;

  beforeEach(() => use24HourClock(false));

  afterEach(() => {
    process.env.TZ = originalTZ;
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

  it('builds new formatters when the host offset changes', function () {
    DateUtils.shortTimeString(instant);
    spyOn(Date.prototype, 'getTimezoneOffset').andReturn(-540);
    spyOn(Intl, 'DateTimeFormat').andCallThrough();
    DateUtils.shortTimeString(instant);
    expect(Intl.DateTimeFormat).toHaveBeenCalled();
  });
});
