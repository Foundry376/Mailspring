import { Calendar } from '../src/flux/models/calendar';
import { isOwnCalendar, isSomeoneElsesCalendar } from '../src/calendar-utils';

describe('calendar ownership', () => {
  const addresses = ['me@example.com', 'alias@example.com'];
  const calendar = (attrs: Partial<Calendar>) =>
    new Calendar({ id: 'cal', accountId: 'acct', ...attrs } as any);

  it("reads the server's DAV:owner verdict from the engine's `owner` key", () => {
    const mine = Calendar.attributes.ownership.fromJSON('mine');
    expect(mine).toBe('mine');
    expect(Calendar.attributes.ownership.jsonKey).toBe('owner');
  });

  describe('isOwnCalendar', () => {
    it("takes the server's word when it names us", () => {
      expect(isOwnCalendar(calendar({ name: 'Team', ownership: 'mine' }), addresses)).toBe(true);
    });

    it("takes the server's word when it names somebody else, whatever the calendar is called", () => {
      // A shared calendar named after our own address must not capture our replies.
      expect(
        isOwnCalendar(calendar({ name: 'me@example.com', ownership: 'other' }), addresses)
      ).toBe(false);
    });

    it('falls back to the display name only when the server said nothing', () => {
      expect(isOwnCalendar(calendar({ name: 'Alias@Example.com', ownership: '' }), addresses)).toBe(
        true
      );
      expect(isOwnCalendar(calendar({ name: 'Holidays', ownership: '' }), addresses)).toBe(false);
    });
  });

  describe('isSomeoneElsesCalendar', () => {
    it('is true only when the server positively named another owner', () => {
      expect(isSomeoneElsesCalendar(calendar({ ownership: 'other' }))).toBe(true);
      expect(isSomeoneElsesCalendar(calendar({ ownership: 'mine' }))).toBe(false);
      expect(isSomeoneElsesCalendar(calendar({ ownership: '' }))).toBe(false);
      expect(isSomeoneElsesCalendar(null)).toBe(false);
    });
  });
});
