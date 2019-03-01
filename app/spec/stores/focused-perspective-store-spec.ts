/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { Folder } from '../../src/flux/models/folder';
import { MailboxPerspective } from '../../src/mailbox-perspective';

import CategoryStore from '../../src/flux/stores/category-store';
import AccountStore from '../../src/flux/stores/account-store';
import FocusedPerspectiveStore from '../../src/flux/stores/focused-perspective-store';

describe('FocusedPerspectiveStore', function() {
  beforeEach(function() {
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
    spyOn(CategoryStore, 'byId').and.callFake((aid, cid) => {
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

  describe('_initializeFromSavedState', function() {
    beforeEach(function() {
      this.default = MailboxPerspective.forCategory(this.inboxCategory);
      spyOn(AccountStore, 'accountIds').andReturn([1, 2]);
      spyOn(MailboxPerspective, 'fromJSON').and.callFake(json => json);
      spyOn(FocusedPerspectiveStore, '_defaultPerspective').andReturn(this.default);
      spyOn(FocusedPerspectiveStore, '_setPerspective');
    });

    it('uses default perspective when no perspective has been saved', function() {
      AppEnv.savedState.sidebarAccountIds = undefined;
      AppEnv.savedState.perspective = undefined;
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        this.default,
        this.default.accountIds
      );
    });

    it('uses default if the saved perspective has account ids no longer present', function() {
      AppEnv.savedState.sidebarAccountIds = [1, 2, 3];
      AppEnv.savedState.perspective = {
        accountIds: [1, 2, 3],
        categories: () => [{ accountId: 1, id: 'A' }],
      };
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        this.default,
        this.default.accountIds
      );

      AppEnv.savedState.sidebarAccountIds = [1, 2, 3];
      AppEnv.savedState.perspective = {
        accountIds: [3],
        categories: () => [{ accountId: 3, id: 'A' }],
      };
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        this.default,
        this.default.accountIds
      );
    });

    it('uses default if the saved perspective has category ids no longer present', function() {
      AppEnv.savedState.sidebarAccountIds = [2];
      AppEnv.savedState.perspective = {
        accountIds: [2],
        categories: () => [{ accountId: 2, id: 'C' }],
      };
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        this.default,
        this.default.accountIds
      );
    });

    it('does not honor sidebarAccountIds if it includes account ids no longer present', function() {
      AppEnv.savedState.sidebarAccountIds = [1, 2, 3];
      AppEnv.savedState.perspective = {
        accountIds: [1],
        categories: () => [{ accountId: 1, id: 'A' }],
      };
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        AppEnv.savedState.perspective,
        [1]
      );
    });

    it('uses the saved perspective if it is still valid', function() {
      AppEnv.savedState.sidebarAccountIds = [1, 2];
      AppEnv.savedState.perspective = {
        accountIds: [1, 2],
        categories: () => [{ accountId: 1, id: 'A' }],
      };
      FocusedPerspectiveStore._initializeFromSavedState();
      expect(FocusedPerspectiveStore._setPerspective).toHaveBeenCalledWith(
        AppEnv.savedState.perspective,
        [1, 2]
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
        [1, 2]
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
        [1]
      );
    });
  });

  describe('_onCategoryStoreChanged', function() {
    it("should try to initialize if the curernt perspective hasn't been fully initialized", function() {
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

    it('should set the current category to default when the current category no longer exists in the CategoryStore', function() {
      const defaultPerspective = this.inboxPerspective;
      FocusedPerspectiveStore._initialized = true;
      spyOn(FocusedPerspectiveStore, '_defaultPerspective').andReturn(defaultPerspective);

      const otherAccountInbox = this.inboxCategory.clone();
      otherAccountInbox.id = 'other-id';
      FocusedPerspectiveStore._current = MailboxPerspective.forCategory(otherAccountInbox);

      FocusedPerspectiveStore._onCategoryStoreChanged();
      expect(FocusedPerspectiveStore.current()).toEqual(defaultPerspective);
    });
  });

  describe('_onFocusPerspective', () =>
    it('should focus the category and trigger', function() {
      FocusedPerspectiveStore._onFocusPerspective(this.userPerspective);
      expect(FocusedPerspectiveStore.trigger).toHaveBeenCalled();
      expect(FocusedPerspectiveStore.current().categories()).toEqual([this.userCategory]);
    }));

  describe('_setPerspective', () =>
    it('should not trigger if the perspective is already focused', function() {
      FocusedPerspectiveStore._setPerspective(this.inboxPerspective);
      FocusedPerspectiveStore.trigger.reset();
      FocusedPerspectiveStore._setPerspective(this.inboxPerspective);
      expect(FocusedPerspectiveStore.trigger).not.toHaveBeenCalled();
    }));
});
