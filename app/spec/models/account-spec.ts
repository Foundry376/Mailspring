import { Account, Contact, CategoryStore } from 'mailspring-exports';

describe('Account', function () {
  describe('constructor defaults', function () {
    it('sets aliases to empty array when not provided', function () {
      const account = new Account({ id: 'test-id', emailAddress: 'test@example.com' });
      expect(account.aliases).toEqual([]);
    });

    it('sets label to emailAddress when label is not provided', function () {
      const account = new Account({ id: 'test-id', emailAddress: 'test@example.com' });
      expect(account.label).toBe('test@example.com');
    });

    it('preserves an explicitly provided label', function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@example.com',
        label: 'My Custom Label',
      });
      expect(account.label).toBe('My Custom Label');
    });

    it('sets syncState to SYNC_STATE_OK when not provided', function () {
      const account = new Account({ id: 'test-id', emailAddress: 'test@example.com' });
      expect(account.syncState).toBe(Account.SYNC_STATE_OK);
    });

    it('sets autoaddress to {type: bcc, value: ""} when not provided', function () {
      const account = new Account({ id: 'test-id', emailAddress: 'test@example.com' });
      expect(account.autoaddress).toEqual({ type: 'bcc', value: '' });
    });

    it('preserves provided autoaddress', function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@example.com',
        autoaddress: { type: 'cc', value: 'cc@example.com' },
      });
      expect(account.autoaddress).toEqual({ type: 'cc', value: 'cc@example.com' });
    });

    it('sets color to empty string when not provided', function () {
      const account = new Account({ id: 'test-id', emailAddress: 'test@example.com' });
      expect(account.color).toBe('');
    });
  });

  describe('displayProvider()', function () {
    const cases = [
      { provider: 'eas', expected: 'Exchange' },
      { provider: 'gmail', expected: 'Gmail' },
      { provider: 'yahoo', expected: 'Yahoo' },
      { provider: 'imap', expected: 'IMAP' },
      { provider: 'yandex', expected: 'Yandex' },
      { provider: 'office365', expected: 'Office 365' },
      { provider: 'outlook', expected: 'Outlook' },
    ];

    cases.forEach(({ provider, expected }) => {
      it(`returns '${expected}' for provider '${provider}'`, function () {
        const account = new Account({ id: 'test-id', emailAddress: 'test@example.com', provider });
        expect(account.displayProvider()).toBe(expected);
      });
    });

    it('returns the raw provider string for unknown providers', function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@example.com',
        provider: 'fastmail',
      });
      expect(account.displayProvider()).toBe('fastmail');
    });
  });

  describe('usesLabels()', function () {
    it('returns true for gmail accounts', function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@gmail.com',
        provider: 'gmail',
      });
      expect(account.usesLabels()).toBe(true);
    });

    it('returns false for imap accounts', function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@example.com',
        provider: 'imap',
      });
      expect(account.usesLabels()).toBe(false);
    });

    it('returns false for exchange accounts', function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@example.com',
        provider: 'eas',
      });
      expect(account.usesLabels()).toBe(false);
    });

    it('returns false for office365 accounts', function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@example.com',
        provider: 'office365',
      });
      expect(account.usesLabels()).toBe(false);
    });
  });

  describe('hasSyncStateError()', function () {
    it("returns false when syncState is 'ok'", function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@example.com',
        syncState: Account.SYNC_STATE_OK,
      });
      expect(account.hasSyncStateError()).toBe(false);
    });

    it('returns false for a freshly created account (default syncState)', function () {
      const account = new Account({ id: 'test-id', emailAddress: 'test@example.com' });
      expect(account.hasSyncStateError()).toBe(false);
    });

    it("returns true when syncState is 'invalid' (auth failed)", function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@example.com',
        syncState: Account.SYNC_STATE_AUTH_FAILED,
      });
      expect(account.hasSyncStateError()).toBe(true);
    });

    it("returns true when syncState is 'sync_error'", function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@example.com',
        syncState: Account.SYNC_STATE_ERROR,
      });
      expect(account.hasSyncStateError()).toBe(true);
    });

    it('returns true for any arbitrary non-ok syncState', function () {
      const account = new Account({
        id: 'test-id',
        emailAddress: 'test@example.com',
        syncState: 'some_unknown_error',
      });
      expect(account.hasSyncStateError()).toBe(true);
    });
  });

  describe('me()', function () {
    it('returns a Contact with the account name and email', function () {
      const account = new Account({
        id: TEST_ACCOUNT_ID,
        name: TEST_ACCOUNT_NAME,
        emailAddress: TEST_ACCOUNT_EMAIL,
      });
      const contact = account.me();
      expect(contact instanceof Contact).toBe(true);
      expect(contact.name).toBe(TEST_ACCOUNT_NAME);
      expect(contact.email).toBe(TEST_ACCOUNT_EMAIL);
    });

    it('returns a Contact with the correct accountId', function () {
      const account = new Account({
        id: TEST_ACCOUNT_ID,
        name: TEST_ACCOUNT_NAME,
        emailAddress: TEST_ACCOUNT_EMAIL,
      });
      const contact = account.me();
      expect(contact.accountId).toBe(TEST_ACCOUNT_ID);
    });

    it('returns a Contact with a consistent id derived from account id', function () {
      const account = new Account({
        id: TEST_ACCOUNT_ID,
        name: TEST_ACCOUNT_NAME,
        emailAddress: TEST_ACCOUNT_EMAIL,
      });
      const contact = account.me();
      expect(contact.id).toBe(`local-${TEST_ACCOUNT_ID}-me`);
    });
  });

  describe('defaultMe()', function () {
    it('returns me() when no defaultAlias is set', function () {
      const account = new Account({
        id: TEST_ACCOUNT_ID,
        name: TEST_ACCOUNT_NAME,
        emailAddress: TEST_ACCOUNT_EMAIL,
      });
      const defaultMe = account.defaultMe();
      expect(defaultMe.email).toBe(TEST_ACCOUNT_EMAIL);
      expect(defaultMe.name).toBe(TEST_ACCOUNT_NAME);
    });

    it('returns a contact from the alias when defaultAlias is set', function () {
      const aliasString = `${TEST_ACCOUNT_NAME} Alternate <${TEST_ACCOUNT_EMAIL}>`;
      const account = new Account({
        id: TEST_ACCOUNT_ID,
        name: TEST_ACCOUNT_NAME,
        emailAddress: TEST_ACCOUNT_EMAIL,
        defaultAlias: aliasString,
      });
      const defaultMe = account.defaultMe();
      expect(defaultMe instanceof Contact).toBe(true);
      expect(defaultMe.accountId).toBe(TEST_ACCOUNT_ID);
    });
  });

  describe('preferredRemovalDestination()', function () {
    let account;

    beforeEach(function () {
      account = new Account({
        id: TEST_ACCOUNT_ID,
        name: TEST_ACCOUNT_NAME,
        emailAddress: TEST_ACCOUNT_EMAIL,
        provider: 'gmail',
      });
    });

    it('returns the trash category when backspaceDelete config is true', function () {
      const fakeTrash = { id: 'trash-folder', role: 'trash' };
      const fakeArchive = { id: 'archive-folder', role: 'all' };
      spyOn(AppEnv.config, 'get').andCallFake((key) => {
        if (key === 'core.reading.backspaceDelete') return true;
        return null;
      });
      spyOn(CategoryStore, 'getTrashCategory').andReturn(fakeTrash);
      spyOn(CategoryStore, 'getArchiveCategory').andReturn(fakeArchive);

      const result = account.preferredRemovalDestination();
      expect(result).toBe(fakeTrash);
      expect(CategoryStore.getTrashCategory).toHaveBeenCalledWith(account);
    });

    it('returns the archive category when backspaceDelete is false and archive exists', function () {
      const fakeTrash = { id: 'trash-folder', role: 'trash' };
      const fakeArchive = { id: 'archive-folder', role: 'all' };
      spyOn(AppEnv.config, 'get').andCallFake((key) => {
        if (key === 'core.reading.backspaceDelete') return false;
        return null;
      });
      spyOn(CategoryStore, 'getTrashCategory').andReturn(fakeTrash);
      spyOn(CategoryStore, 'getArchiveCategory').andReturn(fakeArchive);

      const result = account.preferredRemovalDestination();
      expect(result).toBe(fakeArchive);
      expect(CategoryStore.getArchiveCategory).toHaveBeenCalledWith(account);
    });

    it('returns the trash category when backspaceDelete is false but no archive category exists', function () {
      const fakeTrash = { id: 'trash-folder', role: 'trash' };
      spyOn(AppEnv.config, 'get').andCallFake((key) => {
        if (key === 'core.reading.backspaceDelete') return false;
        return null;
      });
      spyOn(CategoryStore, 'getTrashCategory').andReturn(fakeTrash);
      spyOn(CategoryStore, 'getArchiveCategory').andReturn(null);

      const result = account.preferredRemovalDestination();
      expect(result).toBe(fakeTrash);
    });
  });
});
