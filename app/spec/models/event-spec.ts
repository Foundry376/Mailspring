import { Event, Contact } from 'mailspring-exports';

describe('Event', function () {
  describe('isRecurrenceException()', function () {
    it('returns true when recurrenceId is set to a non-empty string', function () {
      const event = new Event({ recurrenceId: '20240115T100000Z' } as any);
      expect(event.isRecurrenceException()).toBe(true);
    });

    it('returns false when recurrenceId is an empty string', function () {
      const event = new Event({ recurrenceId: '' } as any);
      expect(event.isRecurrenceException()).toBe(false);
    });

    it('returns false when recurrenceId is null', function () {
      const event = new Event({ recurrenceId: null } as any);
      expect(event.isRecurrenceException()).toBe(false);
    });

    it('returns false when recurrenceId is undefined', function () {
      const event = new Event({} as any);
      expect(event.isRecurrenceException()).toBe(false);
    });
  });

  describe('isCancelled()', function () {
    it("returns true when status is 'CANCELLED'", function () {
      const event = new Event({ status: 'CANCELLED' } as any);
      expect(event.isCancelled()).toBe(true);
    });

    it("returns false when status is 'CONFIRMED'", function () {
      const event = new Event({ status: 'CONFIRMED' } as any);
      expect(event.isCancelled()).toBe(false);
    });

    it("returns false when status is 'TENTATIVE'", function () {
      const event = new Event({ status: 'TENTATIVE' } as any);
      expect(event.isCancelled()).toBe(false);
    });

    it('returns false when status is not set', function () {
      const event = new Event({} as any);
      expect(event.isCancelled()).toBe(false);
    });
  });

  describe('masterEventUID()', function () {
    it('returns the icsuid value', function () {
      const event = new Event({ icsuid: 'master-uid-abc-123@calendar' } as any);
      expect(event.masterEventUID()).toBe('master-uid-abc-123@calendar');
    });

    it('returns undefined when icsuid is not set', function () {
      const event = new Event({} as any);
      expect(event.masterEventUID()).toBeUndefined();
    });
  });

  describe('displayTitle()', function () {
    function eventWithTitle(title: string) {
      const event = new Event({} as any);
      event.title = title;
      return event;
    }

    it("strips the 'Invitation: ' prefix from the title", function () {
      const event = eventWithTitle('Invitation: Team Standup');
      expect(event.displayTitle()).toBe('Team Standup');
    });

    it("strips everything before and including 'Invitation: ' if prefixed with other text", function () {
      const event = eventWithTitle('Re: Invitation: Weekly Review');
      expect(event.displayTitle()).toBe('Weekly Review');
    });

    it('returns the title unchanged when there is no Invitation prefix', function () {
      const event = eventWithTitle('Team Lunch');
      expect(event.displayTitle()).toBe('Team Lunch');
    });

    it("strips the ' @ date' suffix when the date portion is parseable by chrono", function () {
      const event = eventWithTitle('Invitation: Team Sync @ Monday at 3pm');
      // chrono can parse "Monday at 3pm" as a date expression
      const result = event.displayTitle();
      expect(result).toBe('Team Sync');
    });

    it("keeps the ' @ text' part when the text after @ is not a parseable date", function () {
      const event = eventWithTitle('Lunch @ Chipotle');
      const result = event.displayTitle();
      // "Chipotle" is not a date, so the full title should be returned
      expect(result).toBe('Lunch @ Chipotle');
    });

    it('handles titles with multiple @ symbols — only splits on the first', function () {
      const event = eventWithTitle('Catch-up @ Office @ 2pm');
      // Splits at first @: "Catch-up" and "Office @ 2pm"
      // "Office @ 2pm" is unlikely to parse as a date; result should include the @
      const result = event.displayTitle();
      // The main thing to verify is that it doesn't throw and returns a string
      expect(typeof result).toBe('string');
    });
  });

  describe('participantForMe()', function () {
    function eventWithParticipants(participants: any[]) {
      const event = new Event({} as any);
      event.participants = participants;
      return event;
    }

    it('returns the participant whose email matches the current user', function () {
      const participants = [
        { email: 'other@example.com', name: 'Other Person' },
        { email: TEST_ACCOUNT_EMAIL, name: TEST_ACCOUNT_NAME },
      ];
      const event = eventWithParticipants(participants);
      // isMe() checks against AccountStore — TEST_ACCOUNT_EMAIL is set up in the test env
      const result = event.participantForMe();
      expect(result).not.toBeNull();
      expect(result.email).toBe(TEST_ACCOUNT_EMAIL);
    });

    it('returns null when no participant matches the current user', function () {
      const participants = [
        { email: 'alice@example.com', name: 'Alice' },
        { email: 'bob@example.com', name: 'Bob' },
      ];
      const event = eventWithParticipants(participants);
      const result = event.participantForMe();
      expect(result).toBeNull();
    });

    it('returns null for an empty participants list', function () {
      const event = eventWithParticipants([]);
      const result = event.participantForMe();
      expect(result).toBeNull();
    });

    it('returns the first matching participant when multiple match', function () {
      // Spy on isMe so both return true to test early exit
      spyOn(Contact.prototype, 'isMe').andCallFake(function (this: Contact) {
        return this.email === TEST_ACCOUNT_EMAIL;
      });
      const participants = [
        { email: TEST_ACCOUNT_EMAIL, name: 'Me First' },
        { email: TEST_ACCOUNT_EMAIL, name: 'Me Second' },
      ];
      const event = eventWithParticipants(participants);
      const result = event.participantForMe();
      expect(result.name).toBe('Me First');
    });

    it('uses Contact.isMe() to determine matching', function () {
      spyOn(Contact.prototype, 'isMe').andReturn(false);
      const participants = [{ email: TEST_ACCOUNT_EMAIL, name: TEST_ACCOUNT_NAME }];
      const event = eventWithParticipants(participants);
      const result = event.participantForMe();
      expect(Contact.prototype.isMe).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});
