import moment from 'moment';
import DateUtils from '../src/date-utils';

describe('DateUtils.parseDateString', function () {
  it('starts the event on the minute and trims the title', function () {
    const { leftoverText, start, end } = DateUtils.parseDateString(
      'QA1 lunch with Sam tomorrow at 12:30pm'
    );
    const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
    expect(leftoverText).toBe('QA1 lunch with Sam');
    expect(start.format('YYYY-MM-DD HH:mm:ss.SSS')).toBe(`${tomorrow} 12:30:00.000`);
    expect(end.format('YYYY-MM-DD HH:mm:ss.SSS')).toBe(`${tomorrow} 13:30:00.000`);
  });

  it('collapses the gap a date leaves mid-title', function () {
    const { leftoverText } = DateUtils.parseDateString('Lunch tomorrow at noon with Sam');
    expect(leftoverText).toBe('Lunch with Sam');
  });

  it('reads Sunday, which chrono numbers weekday 0', function () {
    const { leftoverText, start } = DateUtils.parseDateString('Coffee Sunday');
    expect(leftoverText).toBe('Coffee');
    expect(start.day()).toBe(0);
    expect(Math.abs(start.diff(moment(), 'days'))).toBeLessThan(7);
  });

  it('starts a day named without a time at 9 AM, for an hour', function () {
    const { leftoverText, start, end } = DateUtils.parseDateString('Coffee Monday');
    expect(leftoverText).toBe('Coffee');
    expect(start.day()).toBe(1);
    expect(start.format('HH:mm:ss')).toBe('09:00:00');
    expect(end.diff(start, 'minutes')).toBe(60);

    const tomorrow = DateUtils.parseDateString('Dentist tomorrow').start;
    expect(tomorrow.format('YYYY-MM-DD HH:mm')).toBe(
      `${moment().add(1, 'day').format('YYYY-MM-DD')} 09:00`
    );
  });

  describe('with no day or time named', function () {
    it('starts at the next half hour, for an hour', function () {
      spyOn(moment, 'now').andReturn(new Date(2026, 9, 31, 10, 12).getTime());
      const { leftoverText, start, end } = DateUtils.parseDateString('Call the bank');
      expect(leftoverText).toBe('Call the bank');
      expect(start.format('YYYY-MM-DD HH:mm:ss.SSS')).toBe('2026-10-31 10:30:00.000');
      expect(end.format('HH:mm')).toBe('11:30');
    });

    it('keeps a time that is already on the half hour', function () {
      spyOn(moment, 'now').andReturn(new Date(2026, 9, 31, 10, 30).getTime());
      expect(DateUtils.parseDateString('Call the bank').start.format('HH:mm')).toBe('10:30');
    });
  });

  describe('on a Saturday', function () {
    beforeEach(function () {
      spyOn(moment, 'now').andReturn(new Date(2026, 9, 31, 15, 0).getTime());
    });

    it('takes a weekday already past this week as next week', function () {
      const { start, end } = DateUtils.parseDateString('Lunch Friday at 1pm');
      expect(start.format('YYYY-MM-DD HH:mm')).toBe('2026-11-06 13:00');
      expect(end.format('YYYY-MM-DD HH:mm')).toBe('2026-11-06 14:00');
      expect(DateUtils.parseDateString('Lunch Thursday').start.format('YYYY-MM-DD')).toBe(
        '2026-11-05'
      );
    });

    it('keeps today and a weekday asked for in the past', function () {
      expect(DateUtils.parseDateString('Lunch Saturday').start.format('YYYY-MM-DD')).toBe(
        '2026-10-31'
      );
      expect(DateUtils.parseDateString('Lunch last Friday').start.format('YYYY-MM-DD')).toBe(
        '2026-10-30'
      );
    });
  });

  it('takes a time named after the day', function () {
    const { start } = DateUtils.parseDateString('Coffee Monday at 3pm');
    expect(start.day()).toBe(1);
    expect(start.format('HH:mm')).toBe('15:00');
  });

  it('reads 12am, which chrono numbers hour 0', function () {
    const { leftoverText, start } = DateUtils.parseDateString('Dinner tomorrow at 12am');
    expect(leftoverText).toBe('Dinner');
    expect(start.format('YYYY-MM-DD HH:mm:ss')).toBe(
      `${moment().add(1, 'day').format('YYYY-MM-DD')} 00:00:00`
    );
  });
});
