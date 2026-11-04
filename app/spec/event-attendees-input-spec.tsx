import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';

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

describe('EventAttendeesInput adding typed text', function () {
  const { ContactStore } = require('mailspring-exports');
  let change: jasmine.Spy;
  let input: any;

  beforeEach(function () {
    change = jasmine.createSpy('change');
    input = new EventAttendeesInput({ attendees: [], change } as any);
  });

  it('refuses text with no address in it, so it stays in the field', function () {
    spyOn(ContactStore, 'parseContactsInString');
    expect(input._add('Alex')).toBe(false);
    expect(input._add('alex@example')).toBe(false);
    expect(ContactStore.parseContactsInString).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });

  it('adds an address typed with a name', async function () {
    expect(input._add('Alex <alex@example.com>')).not.toBe(false);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(change.mostRecentCall.args[0].map((a) => a.email)).toEqual(['alex@example.com']);
  });
});

describe('EventAttendeesInput clearing typed text', function () {
  afterEach(cleanup);

  it('empties the field without adding what was typed', async function () {
    const change = jasmine.createSpy('change');
    const { container } = render(
      <EventAttendeesInput attendees={[]} change={change} className="x" clearable />
    );
    const input = container.querySelector('input');
    expect(container.querySelector('.clear-button')).toBe(null);
    fireEvent.change(input, { target: { value: 'alex@example.com' } });
    const clear = container.querySelector('.clear-button');
    // Cancelled, so focus stays in the field and its blur, which adds what's typed, never runs.
    expect(fireEvent.mouseDown(clear)).toBe(false);
    fireEvent.click(clear);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(input.value).toBe('');
    expect(change).not.toHaveBeenCalled();
  });
});
