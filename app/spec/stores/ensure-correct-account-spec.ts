import {
  Actions,
  Contact,
  Message,
  AccountStore,
  TaskQueue,
  DraftEditingSession,
  SyncbackDraftTask,
} from 'mailspring-exports';

function makeDraft(overrides: Partial<Message> = {}) {
  const account = AccountStore.accounts()[0];
  return new Message({
    id: 'draft-1',
    accountId: account.id,
    headerMessageId: 'draft-1@getmailspring.com',
    from: [account.me()],
    to: [new Contact({ email: 'someone@example.com' })],
    subject: 'Hello',
    body: '',
    draft: true,
    ...overrides,
  } as any);
}

describe('DraftEditingSession.ensureCorrectAccount', function () {
  beforeEach(function () {
    spyOn(Actions, 'queueTask');
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve());
  });

  function sessionFor(draft: Message) {
    return new DraftEditingSession(draft.headerMessageId, draft);
  }

  it('does not rehome a reply when From is another account primary', async function () {
    const other = AccountStore.accounts()[1];
    const session = sessionFor(
      makeDraft({
        threadId: 'thread-1',
        from: [new Contact({ email: other.emailAddress, name: other.name })],
      } as any)
    );

    await session.ensureCorrectAccount();

    expect(Actions.queueTask).not.toHaveBeenCalled();
    expect(session.draft().accountId).toBe(TEST_ACCOUNT_ID);
  });

  it('throws on a reply whose From is not one of the user identities', async function () {
    const session = sessionFor(
      makeDraft({
        threadId: 'thread-1',
        from: [new Contact({ email: 'stranger@example.com' })],
      } as any)
    );

    try {
      await session.ensureCorrectAccount();
      expect('should have thrown').toBe('');
    } catch (err) {
      expect(err.message).toMatch(/configured account/);
    }
    expect(Actions.queueTask).not.toHaveBeenCalled();
  });

  it('rehomes a new compose when the picked identity belongs to another account', async function () {
    const other = AccountStore.accounts()[1];
    const session = sessionFor(
      makeDraft({
        from: [
          new Contact({
            email: other.emailAddress,
            name: other.name,
            accountId: other.id,
          }),
        ],
      } as any)
    );

    await session.ensureCorrectAccount();

    expect(Actions.queueTask).toHaveBeenCalled();
    const create = (Actions.queueTask as any).calls[0].args[0];
    expect(create instanceof SyncbackDraftTask).toBe(true);
    expect(create.draft.accountId).toBe(other.id);
  });

  it('does not rehome a new compose when From is another account primary but the identity is on this account', async function () {
    const other = AccountStore.accounts()[1];
    const session = sessionFor(
      makeDraft({
        from: [
          new Contact({
            email: other.emailAddress,
            name: other.name,
            accountId: TEST_ACCOUNT_ID,
          }),
        ],
      } as any)
    );

    await session.ensureCorrectAccount();

    expect(Actions.queueTask).not.toHaveBeenCalled();
    expect(session.draft().accountId).toBe(TEST_ACCOUNT_ID);
  });
});
