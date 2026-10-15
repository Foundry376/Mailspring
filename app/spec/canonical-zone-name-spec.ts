import moment from 'moment-timezone';
import { canonicalZoneName } from '../src/date-utils';

describe('canonicalZoneName', function () {
  it('maps a link name to the zone it stands for', function () {
    expect(canonicalZoneName('America/Indianapolis')).toBe('America/Indiana/Indianapolis');
    expect(canonicalZoneName('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(canonicalZoneName('US/Eastern')).toBe('America/New_York');
    expect(canonicalZoneName('Europe/Kiev')).toBe('Europe/Kyiv');
  });

  it('keeps a link in its own country where tzdata shares one zone between several', function () {
    // tzdata links Asmara to Nairobi; CLDR keeps Eritrea's own name.
    expect(canonicalZoneName('Africa/Asmera')).toBe('Africa/Asmara');
    expect(canonicalZoneName('Africa/Asmara')).toBe('Africa/Asmara');
  });

  it("uses tzdata's links for a rename CLDR's list predates", function () {
    expect(canonicalZoneName('America/Montreal')).toBe('America/Toronto');
    expect(canonicalZoneName('Europe/Kyiv')).toBe('Europe/Kyiv');
  });

  it('follows links through another link to the current zone', function () {
    // tzdata 2022g folded Zaporozhye and Uzhgorod into Kyiv; moment-timezone pairs them with
    // Europe/Kiev, itself a link, and CLDR has no current name for either.
    expect(canonicalZoneName('Europe/Zaporozhye')).toBe('Europe/Kyiv');
    expect(canonicalZoneName('Europe/Uzhgorod')).toBe('Europe/Kyiv');
    expect(canonicalZoneName('America/Fort_Wayne')).toBe('America/Indiana/Indianapolis');
  });

  it('leaves a canonical name alone', function () {
    expect(canonicalZoneName('America/New_York')).toBe('America/New_York');
    expect(canonicalZoneName('America/Indiana/Indianapolis')).toBe('America/Indiana/Indianapolis');
  });

  it('leaves a name with no canonical zone alone', function () {
    expect(canonicalZoneName('UTC')).toBe('UTC');
    expect(canonicalZoneName('Etc/GMT+5')).toBe('Etc/GMT+5');
    expect(canonicalZoneName('Not/A_Zone')).toBe('Not/A_Zone');
  });

  it('gives local time the canonical name of the zone the machine reports', function () {
    spyOn(moment.tz, 'guess').andReturn('Asia/Calcutta');
    const path = require.resolve('../src/date-utils');
    const cached = require.cache[path];
    delete require.cache[path];
    try {
      expect(require('../src/date-utils').default.timeZone).toBe('Asia/Kolkata');
    } finally {
      require.cache[path] = cached;
    }
  });
});
