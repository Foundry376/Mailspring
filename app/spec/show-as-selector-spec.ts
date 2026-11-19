import { defaultShowAs } from '../internal_packages/main-calendar/lib/core/show-as-selector';

describe('defaultShowAs', function () {
  it('starts an all-day event Free and a timed one Busy', function () {
    expect(defaultShowAs(true)).toBe('TRANSPARENT');
    expect(defaultShowAs(false)).toBe('OPAQUE');
  });
});
