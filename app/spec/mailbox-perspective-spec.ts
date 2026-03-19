import {
  AccountStore,
  MailboxPerspective,
  TaskFactory,
  Label,
  CategoryStore,
} from 'mailspring-exports';

describe('MailboxPerspective', function mailboxPerspective() {
  beforeEach(() => {
    this.accountIds = ['a1', 'a2'];
    this.accounts = {
      a1: {
        id: 'a1',
        preferredRemovalDestination: () => ({ displayName: 'archive' }),
      },
      a2: {
        id: 'a2',
        preferredRemovalDestination: () => ({ displayName: 'trash2' }),
      },
    };
    this.perspective = new MailboxPerspective(this.accountIds);
    spyOn(AccountStore, 'accountForId').andCallFake(accId => this.accounts[accId]);
  });

  describe('isEqual', () => {
    // TODO
  });

  describe('canArchiveThreads', () => {
    it('returns false if the perspective is archive', () => {
      const accounts = [{ canArchiveThreads: () => true }, { canArchiveThreads: () => true }];
      spyOn(AccountStore, 'accountsForItems').andReturn(accounts);
      spyOn(this.perspective, 'isArchive').andReturn(true);
      expect(this.perspective.canArchiveThreads()).toBe(false);
    });

    it('returns false if one of the accounts associated with the threads cannot archive', () => {
      const accounts = [{ canArchiveThreads: () => true }, { canArchiveThreads: () => false }];
      spyOn(AccountStore, 'accountsForItems').andReturn(accounts);
      spyOn(this.perspective, 'isArchive').andReturn(false);
      expect(this.perspective.canArchiveThreads()).toBe(false);
    });

    it('returns true otherwise', () => {
      const accounts = [{ canArchiveThreads: () => true }, { canArchiveThreads: () => true }];
      spyOn(AccountStore, 'accountsForItems').andReturn(accounts);
      spyOn(this.perspective, 'isArchive').andReturn(false);
      expect(this.perspective.canArchiveThreads()).toBe(true);
    });
  });

  describe('canMoveThreadsTo', () => {
    it('returns false if the perspective is the target folder', () => {
      const accounts = [{ id: 'a' }, { id: 'b' }];
      spyOn(AccountStore, 'accountsForItems').andReturn(accounts);
      spyOn(this.perspective, 'categoriesSharedRole').andReturn('trash');
      expect(this.perspective.canMoveThreadsTo([], 'trash')).toBe(false);
    });

    it('returns false if one of the accounts associated with the threads does not have the folder', () => {
      const accounts = [{ id: 'a' }, { id: 'b' }];
      spyOn(CategoryStore, 'getCategoryByRole').andReturn(null);
      spyOn(AccountStore, 'accountsForItems').andReturn(accounts);
      spyOn(this.perspective, 'categoriesSharedRole').andReturn('inbox');
      expect(this.perspective.canMoveThreadsTo([], 'trash')).toBe(false);
    });

    it('returns true otherwise', () => {
      const accounts = [{ id: 'a' }, { id: 'b' }];
      const category = { id: 'cat' };
      spyOn(CategoryStore, 'getCategoryByRole').andReturn(category);
      spyOn(AccountStore, 'accountsForItems').andReturn(accounts);
      spyOn(this.perspective, 'categoriesSharedRole').andReturn('inbox');
      expect(this.perspective.canMoveThreadsTo([], 'trash')).toBe(true);
    });
  });

  describe('canReceiveThreadsFromAccountIds', () => {
    it('returns true if the thread account ids are included in the current account ids', () => {
      expect(this.perspective.canReceiveThreadsFromAccountIds(['a1'])).toBe(true);
    });

    it('returns true for cross-account drops when the perspective has valid account ids', () => {
      expect(this.perspective.canReceiveThreadsFromAccountIds(['a4'])).toBe(true);
    });

    it('returns false for empty or missing account ids', () => {
      expect(this.perspective.canReceiveThreadsFromAccountIds([])).toBe(false);
      expect(this.perspective.canReceiveThreadsFromAccountIds()).toBe(false);
    });
  });

  describe('CategoryMailboxPerspective', () => {
    beforeEach(() => {
      this.categories = [
        new Label({ path: 'c1', accountId: 'a1' }),
        new Label({ path: 'c2', accountId: 'a2' }),
        new Label({ path: 'c3', accountId: 'a2' }),
      ];
      this.perspective = MailboxPerspective.forCategories(this.categories);
    });

    describe('canReceiveThreadsFromAccountIds', () => {
      it('returns true if the thread account ids are included in the current account ids', () => {
        expect(this.perspective.canReceiveThreadsFromAccountIds(['a1'])).toBe(true);
      });

      it('returns true for cross-account drops (thread from a different account)', () => {
        expect(this.perspective.canReceiveThreadsFromAccountIds(['a4'])).toBe(true);
      });

      it('returns false for empty or missing account ids', () => {
        expect(this.perspective.canReceiveThreadsFromAccountIds([])).toBe(false);
        expect(this.perspective.canReceiveThreadsFromAccountIds()).toBe(false);
      });

      it('returns false if it is a locked category', () => {
        this.perspective._categories.push(new Label({ role: 'sent', path: 'c4', accountId: 'a1' }));
        expect(this.perspective.canReceiveThreadsFromAccountIds(['a2'])).toBe(false);
      });
    });

    describe('receiveThreads', () => {
      // TODO
    });
  });
});
