import BadgeStore from '../../src/flux/stores/badge-store';

describe('BadgeStore', () =>
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
    })));
