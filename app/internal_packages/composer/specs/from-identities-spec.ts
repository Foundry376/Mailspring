import { AccountStore, Contact, Message } from 'mailspring-exports';
import { fromIdentitiesForDraft } from '../lib/account-contact-field';

describe('fromIdentitiesForDraft', function () {
  beforeEach(function () {
    (AccountStore as any)._caches = {};
  });

  it('lists every account identity on a reply, including other account primaries', function () {
    const draft = new Message({
      accountId: TEST_ACCOUNT_ID,
      threadId: 'thread-1',
      draft: true,
    } as any);
    const emails = fromIdentitiesForDraft(AccountStore.accounts(), draft).map((c) => c.email);

    expect(emails).toContain(TEST_ACCOUNT_EMAIL);
    expect(emails).toContain('second@gmail.com');
  });

  it('de-duplicates the same address that is a primary on one account and an alias on another', function () {
    const other = AccountStore.accounts()[1];
    other.aliases = [`${TEST_ACCOUNT_NAME} <${TEST_ACCOUNT_EMAIL}>`, ...other.aliases];
    (AccountStore as any)._caches = {};

    const draft = new Message({
      accountId: TEST_ACCOUNT_ID,
      threadId: 'thread-1',
      draft: true,
    } as any);
    const emails = fromIdentitiesForDraft(AccountStore.accounts(), draft).map((c) =>
      c.email.toLowerCase()
    );

    expect(emails.filter((e) => e === TEST_ACCOUNT_EMAIL.toLowerCase()).length).toBe(1);
  });

  it('keeps per-account identities on a new compose so SMTP can be chosen', function () {
    const other = AccountStore.accounts()[1];
    other.aliases = [`${TEST_ACCOUNT_NAME} <${TEST_ACCOUNT_EMAIL}>`, ...other.aliases];
    (AccountStore as any)._caches = {};

    const draft = new Message({
      accountId: TEST_ACCOUNT_ID,
      draft: true,
    } as any);
    const matches = fromIdentitiesForDraft(AccountStore.accounts(), draft).filter(
      (c: Contact) => c.email.toLowerCase() === TEST_ACCOUNT_EMAIL.toLowerCase()
    );

    expect(matches.length).toBeGreaterThan(1);
    expect(matches.map((c) => c.accountId).sort()).toEqual([TEST_ACCOUNT_ID, other.id].sort());
  });
});
