import moment from 'moment';
import 'moment/locale/de';
import 'moment/locale/gom-latn';
import 'moment/locale/ko';
import 'moment/locale/ne';
import 'moment/locale/sw';
import DateUtils from '../src/date-utils';
import { use24HourClock } from './fixtures/use-24-hour-clock';

// Each moment/locale import above switches the global locale as it loads.
moment.locale('en');

describe('DateUtils.localeTimeFormat', function () {
  afterEach(() => moment.locale('en'));

  it("is the locale's own format when Use 24-hour clock is off", function () {
    use24HourClock(false);
    expect(DateUtils.localeTimeFormat()).toBe('h:mm A');
  });

  describe('with Use 24-hour clock on', function () {
    beforeEach(() => use24HourClock(true));

    it('drops a trailing meridiem', function () {
      expect(DateUtils.localeTimeFormat()).toBe('HH:mm');
    });

    it('drops a leading meridiem', function () {
      moment.locale('ko');
      expect(DateUtils.localeTimeFormat()).toBe('HH:mm');
    });

    it('drops the suffix a meridiem carries, and keeps the hour word', function () {
      moment.locale('ne');
      expect(DateUtils.localeTimeFormat()).toBe('HH:mm बजे');
    });

    it('keeps a bracketed literal', function () {
      moment.locale('gom-latn');
      expect(DateUtils.localeTimeFormat()).toBe('HH:mm [vazta]');
    });

    it('turns a padded 12-hour hour into HH', function () {
      moment.locale('sw');
      expect(DateUtils.localeTimeFormat()).toBe('HH:mm');
    });

    it('leaves a 24-hour locale as it is', function () {
      moment.locale('de');
      expect(DateUtils.localeTimeFormat()).toBe('HH:mm');
    });
  });
});
