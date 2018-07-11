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

    it('returns false otherwise', () => {
      expect(this.perspective.canReceiveThreadsFromAccountIds(['a4'])).toBe(false);
      expect(this.perspective.canReceiveThreadsFromAccountIds([])).toBe(false);
      expect(this.perspective.canReceiveThreadsFromAccountIds()).toBe(false);
    });
  });

  // todo bg
  xdescribe('tasksForRemovingItems', () => {
    beforeEach(() => {
      this.categories = {
        a1: {
          archive: new Label({ role: 'archive', path: 'archive', accountId: 'a1' }),
          inbox: new Label({ role: 'inbox', path: 'inbox1', accountId: 'a1' }),
          trash: new Label({ role: 'trash', path: 'trash1', accountId: 'a1' }),
          category: new Label({ role: null, path: 'folder1', accountId: 'a1' }),
        },
        a2: {
          archive: new Label({ role: 'all', path: 'all', accountId: 'a2' }),
          inbox: new Label({ role: 'inbox', path: 'inbox2', accountId: 'a2' }),
          trash: new Label({ role: 'trash', path: 'trash2', accountId: 'a2' }),
          category: new Label({ role: null, path: 'label2', accountId: 'a2' }),
        },
      };
      this.threads = [{ accountId: 'a1' }, { accountId: 'a2' }];
      spyOn(TaskFactory, 'tasksForApplyingCategories');
      spyOn(CategoryStore, 'getTrashCategory').andCallFake(accId => {
        return this.categories[accId].trash;
      });
    });

    function assertMoved(accId) {
      expect(TaskFactory.tasksForApplyingCategories).toHaveBeenCalled();
      const { args } = TaskFactory.tasksForApplyingCategories.calls[0];
      const { categoriesToRemove, categoriesToAdd } = args[0];

      const assertor = {
        from(originName) {
          expect(categoriesToRemove(accId)[0].displayName).toEqual(originName);
          return assertor;
        },
        to(destinationName) {
          expect(categoriesToAdd(accId)[0].displayName).toEqual(destinationName);
          return assertor;
        },
      };
      return assertor;
    }

    it('moves to finished category if viewing inbox', () => {
      const perspective = MailboxPerspective.forCategories([
        this.categories.a1.inbox,
        this.categories.a2.inbox,
      ]);
      perspective.tasksForRemovingItems(this.threads);
      assertMoved('a1')
        .from('inbox1')
        .to('archive');
      assertMoved('a2')
        .from('inbox2')
        .to('trash2');
    });

    it('moves to trash if viewing archive', () => {
      const perspective = MailboxPerspective.forCategories([
        this.categories.a1.archive,
        this.categories.a2.archive,
      ]);
      perspective.tasksForRemovingItems(this.threads);
      assertMoved('a1')
        .from('archive')
        .to('trash1');
      assertMoved('a2')
        .from('all')
        .to('trash2');
    });

    it('deletes permanently if viewing trash', () => {
      // TODO
      // Not currently possible
    });

    it('moves to default finished category if viewing category', () => {
      const perspective = MailboxPerspective.forCategories([
        this.categories.a1.category,
        this.categories.a2.category,
      ]);
      perspective.tasksForRemovingItems(this.threads);
      assertMoved('a1')
        .from('folder1')
        .to('archive');
      assertMoved('a2')
        .from('label2')
        .to('trash2');
    });

    it('unstars if viewing starred', () => {
      spyOn(TaskFactory, 'taskForInvertingStarred').andReturn({ some: 'task' });
      const perspective = MailboxPerspective.forStarred(this.accountIds);
      const tasks = perspective.tasksForRemovingItems(this.threads);
      expect(tasks).toEqual([{ some: 'task' }]);
    });

    it('does nothing when viewing spam or sent', () => {
      ['spam', 'sent'].forEach(invalid => {
        const perspective = MailboxPerspective.forCategories([
          new Label({ role: invalid, accountId: 'a1' }),
          new Label({ role: invalid, accountId: 'a2' }),
        ]);
        const tasks = perspective.tasksForRemovingItems(this.threads);
        expect(TaskFactory.tasksForApplyingCategories).not.toHaveBeenCalled();
        expect(tasks).toEqual([]);
      });
    });

    describe('when perspective is category perspective', () => {
      it('does not create tasks if any name in the ruleset is null', () => {
        const perspective = MailboxPerspective.forCategories([this.categories.a1.category]);
        spyOn(perspective, 'categoriesSharedRole').andReturn('all');
        const tasks = perspective.tasksForRemovingItems(this.threads);
        expect(tasks).toEqual([]);
      });
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

      it('returns false otherwise', () => {
        expect(this.perspective.canReceiveThreadsFromAccountIds(['a4'])).toBe(false);
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
