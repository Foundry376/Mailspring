/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { Folder } from '../../src/flux/models/folder';
import { MailboxPerspective } from '../../src/mailbox-perspective';

import CategoryStore from '../../src/flux/stores/category-store';
import { AccountStore } from '../../src/flux/stores/account-store';
import FocusedPerspectiveStore from '../../src/flux/stores/focused-perspective-store';
import WorkspaceStore from '../../src/flux/stores/workspace-store';
import * as Actions from '../../src/flux/actions';

describe('FocusedPerspectiveStore', function () {
  beforeEach(function () {
    spyOn(FocusedPerspectiveStore, 'trigger');
    FocusedPerspectiveStore._current = MailboxPerspective.forNothing();
    this.account = AccountStore.accounts()[0];

    this.inboxCategory = new Folder({
      id: 'id-123',
      role: 'inbox',
      path: 'INBOX',
      accountId: this.account.id,
    });
    this.inboxPerspective = MailboxPerspective.forCategory(this.inboxCategory);
    this.userCategory = new Folder({
      id: 'id-456',
      role: null,
      path: 'MyCategory',
      accountId: this.account.id,
    });
    this.userPerspective = MailboxPerspective.forCategory(this.userCategory);

    spyOn(CategoryStore, 'getCategoryByRole').andReturn(this.inboxCategory);
    spyOn(CategoryStore, 'byId').andCallFake((aid, cid) => {
      if (aid === 1 && cid === 'A') {
        return { id: 'A' };
      }
      if (cid === this.inboxCategory.id) {
        return this.inboxCategory;
      }
      if (cid === this.userCategory.id) {
        return this.userCategory;
      }
      return null;
    });
  });

  describe('_initializeFromSavedState', function () {
    beforeEach(function () {
      this.default = MailboxPerspective.forCategory(this.inboxCategory);
      spyOn(AccountStore, 'accountIds').andReturn([1, 2]);
      spyOn(MailboxPerspective, 'fromJSON').andCallFake((json) => json);
      spyOn(FocusedPerspectiveStore, '_defaultPerspective').andReturn(this.default);
      spyOn(FocusedPerspectiveStore, '_setPerspective');
    });

    it('uses default perspective when no perspective has been saved', function () {
      AppEnv.savedState.sidebarAccountIds = undefined;
      AppEnv.savedState.perspective = undefined;
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        this.default,
        this.default.accountIds,
        { keepSection: true }
      );
    });

    it('uses default if the saved perspective has account ids no longer present', function () {
      AppEnv.savedState.sidebarAccountIds = [1, 2, 3];
      AppEnv.savedState.perspective = {
        accountIds: [1, 2, 3],
        categories: () => [{ accountId: 1, id: 'A' }],
      };
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        this.default,
        this.default.accountIds,
        { keepSection: true }
      );

      AppEnv.savedState.sidebarAccountIds = [1, 2, 3];
      AppEnv.savedState.perspective = {
        accountIds: [3],
        categories: () => [{ accountId: 3, id: 'A' }],
      };
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        this.default,
        this.default.accountIds,
        { keepSection: true }
      );
    });

    it('uses default if the saved perspective has category ids no longer present', function () {
      AppEnv.savedState.sidebarAccountIds = [2];
      AppEnv.savedState.perspective = {
        accountIds: [2],
        categories: () => [{ accountId: 2, id: 'C' }],
      };
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        this.default,
        this.default.accountIds,
        { keepSection: true }
      );
    });

    it('does not honor sidebarAccountIds if it includes account ids no longer present', function () {
      AppEnv.savedState.sidebarAccountIds = [1, 2, 3];
      AppEnv.savedState.perspective = {
        accountIds: [1],
        categories: () => [{ accountId: 1, id: 'A' }],
      };
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        AppEnv.savedState.perspective,
        [1],
        { keepSection: true }
      );
    });

    it('uses the saved perspective if it is still valid', function () {
      AppEnv.savedState.sidebarAccountIds = [1, 2];
      AppEnv.savedState.perspective = {
        accountIds: [1, 2],
        categories: () => [{ accountId: 1, id: 'A' }],
      };
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        AppEnv.savedState.perspective,
        [1, 2],
        { keepSection: true }
      );

      AppEnv.savedState.sidebarAccountIds = [1, 2];
      AppEnv.savedState.perspective = {
        accountIds: [1],
        categories: () => [],
        type: 'DraftsMailboxPerspective',
      };

      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        AppEnv.savedState.perspective,
        [1, 2],
        { keepSection: true }
      );

      AppEnv.savedState.sidebarAccountIds = [1];
      AppEnv.savedState.perspective = {
        accountIds: [1],
        categories: () => [],
        type: 'DraftsMailboxPerspective',
      };

      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        AppEnv.savedState.perspective,
        [1],
        { keepSection: true }
      );
    });
  });

  describe('_onCategoryStoreChanged', function () {
    it("should try to initialize if the curernt perspective hasn't been fully initialized", function () {
      spyOn(FocusedPerspectiveStore, '_initializeFromSavedState');

      FocusedPerspectiveStore._current = this.inboxPerspective;
      FocusedPerspectiveStore._initialized = true;
      FocusedPerspectiveStore._onCategoryStoreChanged();
      expect(FocusedPerspectiveStore._initializeFromSavedState).not.toHaveBeenCalled();

      FocusedPerspectiveStore._current = MailboxPerspective.forNothing();
      FocusedPerspectiveStore._initialized = false;
      FocusedPerspectiveStore._onCategoryStoreChanged();
      expect(FocusedPerspectiveStore._initializeFromSavedState).toHaveBeenCalled();
    });

    it('should set the current category to default when the current category no longer exists in the CategoryStore', function () {
      const defaultPerspective = this.inboxPerspective;
      FocusedPerspectiveStore._initialized = true;
      spyOn(FocusedPerspectiveStore, '_defaultPerspective').andReturn(defaultPerspective);

      const otherAccountInbox = this.inboxCategory.clone();
      otherAccountInbox.id = 'other-id';
      (FocusedPerspectiveStore as any)._current = MailboxPerspective.forCategory(otherAccountInbox);

      FocusedPerspectiveStore._onCategoryStoreChanged();
      expect(FocusedPerspectiveStore.current()).toEqual(defaultPerspective);
    });
  });

  describe('_onFocusPerspective', () =>
    it('should focus the category and trigger', function () {
      FocusedPerspectiveStore._onFocusPerspective(this.userPerspective);
      expect(FocusedPerspectiveStore.trigger).toHaveBeenCalled();
      expect(FocusedPerspectiveStore.current().categories()).toEqual([this.userCategory]);
    }));

  describe('_setPerspective', function () {
    it('should not trigger if the perspective is already focused', function () {
      FocusedPerspectiveStore._setPerspective(this.inboxPerspective);
      (FocusedPerspectiveStore.trigger as jasmine.Spy).reset();
      FocusedPerspectiveStore._setPerspective(this.inboxPerspective);
      expect(FocusedPerspectiveStore.trigger).not.toHaveBeenCalled();
    });

    describe('while another section shows', function () {
      beforeEach(function () {
        // Sheet.Threads and Sheet.Drafts are only defined in the main window.
        this.threadsSheet = { id: 'Threads', root: true };
        this.draftsSheet = { id: 'Drafts', root: true };
        this.otherSection = { id: 'OtherSection', root: true };
        spyOn(this.inboxPerspective, 'sheet').andReturn(this.threadsSheet);
        spyOn(this.userPerspective, 'sheet').andReturn(this.draftsSheet);
        spyOn(WorkspaceStore, 'rootSheet').andReturn(this.otherSection);
        spyOn(WorkspaceStore, 'topSheet').andReturn(this.otherSection);
        spyOn(Actions, 'selectRootSheet');
        spyOn(Actions, 'popToRootSheet');
        FocusedPerspectiveStore._current = this.userPerspective;
      });

      it('switches to mail for a mailbox the user picked', function () {
        FocusedPerspectiveStore._setPerspective(this.inboxPerspective);
        expect(Actions.selectRootSheet).toHaveBeenCalledWith(this.threadsSheet);
      });

      it('stays in the section for a change made with keepSection', function () {
        FocusedPerspectiveStore._setPerspective(this.inboxPerspective, undefined, {
          keepSection: true,
        });
        expect(Actions.selectRootSheet).not.toHaveBeenCalled();
        expect(FocusedPerspectiveStore.current()).toBe(this.inboxPerspective);
      });

      it('stays in the section when the focused folder disappears', function () {
        const goneInbox = this.inboxCategory.clone();
        goneInbox.id = 'gone-id';
        FocusedPerspectiveStore._current = MailboxPerspective.forCategory(goneInbox);
        FocusedPerspectiveStore._initialized = true;
        spyOn(FocusedPerspectiveStore, '_defaultPerspective').andReturn(this.inboxPerspective);
        FocusedPerspectiveStore._onCategoryStoreChanged();
        expect(FocusedPerspectiveStore.current()).toBe(this.inboxPerspective);
        expect(Actions.selectRootSheet).not.toHaveBeenCalled();
      });

      it('stays in the section while the mailbox is still initializing', function () {
        AppEnv.savedState.perspective = undefined;
        FocusedPerspectiveStore._initialized = false;
        spyOn(FocusedPerspectiveStore, '_defaultPerspective').andReturn(this.inboxPerspective);
        FocusedPerspectiveStore._onCategoryStoreChanged();
        expect(FocusedPerspectiveStore.current()).toBe(this.inboxPerspective);
        expect(Actions.selectRootSheet).not.toHaveBeenCalled();
      });

      it('stays in the section when an account is added or removed', function () {
        spyOn(FocusedPerspectiveStore, '_defaultPerspective').andReturn(this.inboxPerspective);
        Actions.focusDefaultMailboxPerspectiveForAccounts([this.account.id], { keepSection: true });
        expect(FocusedPerspectiveStore.current()).toBe(this.inboxPerspective);
        expect(Actions.selectRootSheet).not.toHaveBeenCalled();
      });

      it('still changes mail sheets with keepSection when mail is showing', function () {
        (WorkspaceStore.rootSheet as jasmine.Spy).andReturn(this.draftsSheet);
        FocusedPerspectiveStore._setPerspective(this.inboxPerspective, undefined, {
          keepSection: true,
        });
        expect(Actions.selectRootSheet).toHaveBeenCalledWith(this.threadsSheet);
      });
    });
  });
});
