import BadgeStore from '../../src/flux/stores/badge-store';
import FocusedPerspectiveStore from '../../src/flux/stores/focused-perspective-store';
import { AccountStore } from '../../src/flux/stores/account-store';
import CategoryStore from '../../src/flux/stores/category-store';

describe('BadgeStore', function () {
  describe('_setBadgeForCount', () =>
    it('should set the badge correctly', function () {
      spyOn(BadgeStore, '_setBadge');
      (BadgeStore as any)._unread = 0;
      BadgeStore._setBadgeForCount();
      expect(BadgeStore._setBadge).toHaveBeenCalledWith('');
      (BadgeStore as any)._unread = 1;
      BadgeStore._setBadgeForCount();
      expect(BadgeStore._setBadge).toHaveBeenCalledWith('1');
      (BadgeStore as any)._unread = 100;
      BadgeStore._setBadgeForCount();
      expect(BadgeStore._setBadge).toHaveBeenCalledWith('100');
      (BadgeStore as any)._unread = 1000;
      BadgeStore._setBadgeForCount();
      expect(BadgeStore._setBadge).toHaveBeenCalledWith('999+');
    }));

  describe('_updateCounts', function () {
    let originalUnread: number;
    let originalTotal: number;

    beforeEach(function () {
      // BadgeStore is a singleton shared across the whole spec run, and other
      // suites (system-tray) read its counts, so snapshot and restore them.
      originalUnread = (BadgeStore as any)._unread;
      originalTotal = (BadgeStore as any)._total;

      // Force the counts to a value the store cannot compute, so the
      // "counts unchanged" early return never hides a call.
      (BadgeStore as any)._unread = -1;
      (BadgeStore as any)._total = -1;
      spyOn(BadgeStore, '_setBadge');
      spyOn(FocusedPerspectiveStore, 'current').andReturn({ accountIds: ['a'] } as any);
      spyOn(AccountStore, 'accountIds').andReturn(['a', 'b']);
      spyOn(CategoryStore, 'getCategoriesWithRoles').andReturn([]);
    });

    afterEach(function () {
      (BadgeStore as any)._unread = originalUnread;
      (BadgeStore as any)._total = originalTotal;
    });

    const setAllAccountsPref = (value: boolean) => {
      spyOn(AppEnv.config, 'get').andCallFake((keyPath: string) =>
        keyPath === 'core.notifications.countBadgeAllAccounts' ? value : undefined
      );
    };

    it('counts only the focused perspective accounts by default', function () {
      setAllAccountsPref(false);
      (BadgeStore as any)._updateCounts();
      expect(CategoryStore.getCategoriesWithRoles).toHaveBeenCalledWith(['a'], 'inbox');
    });

    it('counts every account when countBadgeAllAccounts is enabled', function () {
      setAllAccountsPref(true);
      (BadgeStore as any)._updateCounts();
      expect(CategoryStore.getCategoriesWithRoles).toHaveBeenCalledWith(['a', 'b'], 'inbox');
    });
  });
});
