import { customAlertLabel } from '../internal_packages/main-calendar/lib/core/alert-selector';

describe('customAlertLabel', function () {
  it('reads a reminder before a timed event in its largest whole unit', function () {
    expect(customAlertLabel('-PT20M', false)).toBe('20 minutes before');
    expect(customAlertLabel('-PT1H30M', false)).toBe('90 minutes before');
    expect(customAlertLabel('-PT3H', false)).toBe('3 hours before');
    expect(customAlertLabel('-P3D', false)).toBe('3 days before');
    expect(customAlertLabel('PT0S', false)).toBe('At time of event');
  });

  it('reads Custom on an all-day event, where a relative reminder counts from midnight', function () {
    // Google's "9 AM the day before".
    expect(customAlertLabel('-PT15H', true)).toBe('Custom');
  });

  it('reads Custom for a reminder after the start or at a set time', function () {
    expect(customAlertLabel('PT5M', false)).toBe('Custom');
    expect(customAlertLabel('20261116T090000Z', false)).toBe('Custom');
  });
});
