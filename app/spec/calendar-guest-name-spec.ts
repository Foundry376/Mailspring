import { Contact } from '../src/flux/models/contact';
import {
  contactNamesByEmail,
  guestName,
} from '../internal_packages/main-calendar/lib/core/attendee-status';
import { EventAttendee } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const guest = (email: string, name = ''): EventAttendee => ({
  email,
  name,
  partstat: 'NEEDS-ACTION',
});

describe('guestName', function () {
  const contactNames = contactNamesByEmail([
    new Contact({ email: 'sam@example.com', name: 'Sam Rivera' }),
    new Contact({ email: 'bare@example.com', name: 'bare@example.com' }),
    new Contact({ email: 'dana@example.com', name: 'dana@example.com' }),
    new Contact({ email: 'dana@example.com', name: 'Dana Lee' }),
  ]);

  it("keeps the invitation's own name over a contact's", function () {
    expect(guestName(guest('sam@example.com', 'Samantha'), contactNames)).toBe('Samantha');
  });

  it("takes a contact's name for an unnamed guest, whatever the address's letter case", function () {
    expect(guestName(guest('Sam@Example.com'), contactNames)).toBe('Sam Rivera');
  });

  it('takes the named one of several contacts for an address', function () {
    expect(guestName(guest('dana@example.com'), contactNames)).toBe('Dana Lee');
  });

  it('falls back to the address when no contact has a name for it', function () {
    expect(guestName(guest('bare@example.com'), contactNames)).toBe('bare@example.com');
    expect(guestName(guest('nobody@example.com'), contactNames)).toBe('nobody@example.com');
  });
});
