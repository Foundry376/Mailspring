import { SendDraftTask, Message, Contact, AccountStore } from 'mailspring-exports';

function makeDraft(overrides: Partial<Message> = {}) {
  return new Message({
    id: 'draft-1',
    accountId: TEST_ACCOUNT_ID,
    headerMessageId: 'draft-1@getmailspring.com',
    from: [new Contact({ email: TEST_ACCOUNT_EMAIL, name: TEST_ACCOUNT_NAME })],
    to: [new Contact({ email: 'someone@example.com' })],
    subject: 'Hello',
    body: 'Hi',
    draft: true,
    ...overrides,
  } as any);
}

function taskFor(draft: Message) {
  const task = new SendDraftTask({});
  task.draft = draft;
  return task;
}

describe('SendDraftTask', function () {
  describe('willBeQueued()', function () {
    it('throws when the draft has no from address', function () {
      const task = taskFor(makeDraft({ from: [] } as any));
      expect(() => task.willBeQueued()).toThrow();
    });

    it('throws when the from address is not one of the user identities', function () {
      const task = taskFor(
        makeDraft({
          from: [new Contact({ email: 'stranger@example.com' })],
        } as any)
      );
      expect(() => task.willBeQueued()).toThrow();
    });

    it('throws when the draft accountId is not a configured account', function () {
      const task = taskFor(makeDraft({ accountId: 'missing-account' } as any));
      expect(() => task.willBeQueued()).toThrow();
    });

    it('allows sending from the account primary address', function () {
      const task = taskFor(makeDraft());
      expect(() => task.willBeQueued()).not.toThrow();
    });

    it('allows sending from an alias of the same account', function () {
      const task = taskFor(
        makeDraft({
          from: [new Contact({ email: TEST_ACCOUNT_ALIAS_EMAIL })],
        } as any)
      );
      expect(() => task.willBeQueued()).not.toThrow();
    });

    it('allows sending from another account primary using this account SMTP', function () {
      const other = AccountStore.accounts()[1];
      const task = taskFor(
        makeDraft({
          accountId: TEST_ACCOUNT_ID,
          from: [new Contact({ email: other.emailAddress, name: other.name })],
        } as any)
      );
      expect(() => task.willBeQueued()).not.toThrow();
    });
  });
});
