import React from 'react';
import { render, cleanup } from '@testing-library/react';

import { EventAttendeesInput } from '../internal_packages/main-calendar/lib/core/event-attendees-input';
import { EventAttendee } from '../internal_packages/main-calendar/lib/core/calendar-data-source';

const attendee = (email: string, name?: string): EventAttendee => ({
  email,
  name: name || '',
  partstat: 'NEEDS-ACTION',
});

describe('EventAttendeesInput token validity', function () {
  afterEach(cleanup);

  const renderTokens = (attendees: EventAttendee[]) => {
    const { container } = render(
      <EventAttendeesInput attendees={attendees} change={() => {}} className="event-attendees" />
    );
    return container.querySelectorAll('.token');
  };

  it('does not mark well-formed attendees invalid', function () {
    const tokens = renderTokens([
      attendee('ben@mailspring.com'),
      attendee('evan@example.com', 'Evan Morikawa'),
    ]);
    expect(tokens.length).toBe(2);
    expect(tokens[0].classList.contains('invalid')).toBe(false);
    expect(tokens[1].classList.contains('invalid')).toBe(false);
  });

  it('marks attendees whose address is malformed or missing', function () {
    const tokens = renderTokens([
      attendee('not-an-address'),
      attendee(''),
      attendee('ben@mailspring.com and friends'),
    ]);
    expect(tokens.length).toBe(3);
    expect(tokens[0].classList.contains('invalid')).toBe(true);
    expect(tokens[1].classList.contains('invalid')).toBe(true);
    expect(tokens[2].classList.contains('invalid')).toBe(true);
  });

  it('accepts the plus-addressed and subdomain forms that appear in real invitations', function () {
    const tokens = renderTokens([
      attendee('ben+calendar@mailspring.com'),
      attendee('ben@mail.corp.example.co.uk'),
    ]);
    expect(tokens[0].classList.contains('invalid')).toBe(false);
    expect(tokens[1].classList.contains('invalid')).toBe(false);
  });
});
