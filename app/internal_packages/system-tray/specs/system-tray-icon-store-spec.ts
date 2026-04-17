import { ipcRenderer } from 'electron';
import { BadgeStore } from 'mailspring-exports';
import SystemTrayIconStore from '../lib/system-tray-icon-store';

describe('SystemTrayIconStore', function systemTrayIconStore() {
  beforeEach(() => {
    spyOn(ipcRenderer, 'send');
    this.iconStore = new SystemTrayIconStore();
  });

  function getIconPath() {
    const { args } = (ipcRenderer.send as jasmine.Spy).calls[0];
    return args[1];
  }

  describe('_getIconImageData', () => {
    it('shows inbox zero icon when isInboxZero and window is focused', () => {
      spyOn(BadgeStore, 'unread').andReturn(0);
      spyOn(BadgeStore, 'total').andReturn(0);
      this.iconStore._updateIcon();
      expect(getIconPath()).toEqual(this.iconStore.inboxZeroIcon());
    });

    it('shows inbox zero icon when isInboxZero and window is blurred', () => {
      this.iconStore._windowBackgrounded = true;
      spyOn(BadgeStore, 'unread').andReturn(0);
      spyOn(BadgeStore, 'total').andReturn(0);
      this.iconStore._updateIcon();
      expect(getIconPath()).toEqual(this.iconStore.inboxZeroIcon());
    });

    it('shows inbox full icon when not isInboxZero and window is focused', () => {
      this.iconStore._windowBackgrounded = false;
      spyOn(BadgeStore, 'unread').andReturn(102);
      spyOn(BadgeStore, 'total').andReturn(123123);
      this.iconStore._updateIcon();
      expect(getIconPath()).toEqual(this.iconStore.inboxFullUnreadIcon());
    });

    it('shows inbox full /alt/ icon when not isInboxZero and window is blurred', () => {
      this.iconStore._windowBackgrounded = true;
      spyOn(BadgeStore, 'unread').andReturn(102);
      spyOn(BadgeStore, 'total').andReturn(123123);
      this.iconStore._updateIcon();
      expect(getIconPath()).toEqual(this.iconStore.inboxFullUnreadIcon());
    });
  });

  describe('when trayIconStyle is none', () => {
    beforeEach(() => {
      spyOn(AppEnv.config, 'get').andCallFake((key) => {
        if (key === 'core.workspace.trayIconStyle') return 'none';
        return undefined;
      });
    });

    it('shows inbox full icon even when there are unread messages', () => {
      spyOn(BadgeStore, 'unread').andReturn(5);
      spyOn(BadgeStore, 'total').andReturn(10);
      this.iconStore._updateIcon();
      expect(getIconPath()).toEqual(this.iconStore.inboxFullIcon());
    });

    it('shows inbox zero icon when inbox is empty', () => {
      spyOn(BadgeStore, 'unread').andReturn(0);
      spyOn(BadgeStore, 'total').andReturn(0);
      this.iconStore._updateIcon();
      expect(getIconPath()).toEqual(this.iconStore.inboxZeroIcon());
    });
  });

  describe('updating the icon based on focus and blur', () => {
    it('always shows inbox full icon when the window gets focused', () => {
      spyOn(BadgeStore, 'total').andReturn(1);
      this.iconStore._onWindowFocus();
      const path = getIconPath();
      expect(path).toBe(this.iconStore.inboxFullUnreadIcon());
    });

    it('shows inbox full /alt/ icon ONLY when window is currently backgrounded and total count changes', () => {
      this.iconStore._windowBackgrounded = false;
      this.iconStore._onWindowBackgrounded();
      expect(ipcRenderer.send).not.toHaveBeenCalled();

      // BadgeStore triggers a change
      spyOn(BadgeStore, 'total').andReturn(1);
      this.iconStore._updateIcon();

      const path = getIconPath();
      expect(path).toBe(this.iconStore.inboxFullUnreadIcon());
    });

    it('does not show inbox full /alt/ icon when window is currently focused and total count changes', () => {
      this.iconStore._windowBackgrounded = false;

      // BadgeStore triggers a change
      spyOn(BadgeStore, 'total').andReturn(1);
      this.iconStore._updateIcon();

      const path = getIconPath();
      expect(path).toBe(this.iconStore.inboxFullUnreadIcon());
    });
  });
});
