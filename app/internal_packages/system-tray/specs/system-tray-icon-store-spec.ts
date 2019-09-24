import { ipcRenderer } from 'electron';
import { BadgeStore } from 'mailspring-exports';
import SystemTrayIconStore from '../lib/system-tray-icon-store';

const { INBOX_ZERO_ICON, INBOX_FULL_ICON, INBOX_FULL_UNREAD_ICON } = SystemTrayIconStore;

describe('SystemTrayIconStore', function systemTrayIconStore() {
  beforeEach(() => {
    spyOn(ipcRenderer, 'send');
    this.iconStore = new SystemTrayIconStore();
  });

  function getCallData() {
    const { args } = (ipcRenderer.send as any).calls[0];
    return { path: args[1], isTemplateImg: args[3] };
  }

  describe('_getIconImageData', () => {
    it('shows inbox zero icon when isInboxZero and window is focused', () => {
      spyOn(BadgeStore, 'unread').andReturn(0);
      spyOn(BadgeStore, 'total').andReturn(0);
      this.iconStore._updateIcon();
      expect(getCallData()).toEqual({ path: INBOX_ZERO_ICON, isTemplateImg: true });
    });

    it('shows inbox zero icon when isInboxZero and window is blurred', () => {
      this.iconStore._windowBackgrounded = true;
      spyOn(BadgeStore, 'unread').andReturn(0);
      spyOn(BadgeStore, 'total').andReturn(0);
      this.iconStore._updateIcon();
      expect(getCallData()).toEqual({ path: INBOX_ZERO_ICON, isTemplateImg: true });
    });

    it('shows inbox full icon when not isInboxZero and window is focused', () => {
      this.iconStore._windowBackgrounded = false;
      spyOn(BadgeStore, 'unread').andReturn(102);
      spyOn(BadgeStore, 'total').andReturn(123123);
      this.iconStore._updateIcon();
      expect(getCallData()).toEqual({ path: INBOX_FULL_ICON, isTemplateImg: true });
    });

    it('shows inbox full /alt/ icon when not isInboxZero and window is blurred', () => {
      this.iconStore._windowBackgrounded = true;
      spyOn(BadgeStore, 'unread').andReturn(102);
      spyOn(BadgeStore, 'total').andReturn(123123);
      this.iconStore._updateIcon();
      expect(getCallData()).toEqual({ path: INBOX_FULL_UNREAD_ICON, isTemplateImg: false });
    });
  });

  describe('updating the icon based on focus and blur', () => {
    it('always shows inbox full icon when the window gets focused', () => {
      spyOn(BadgeStore, 'total').andReturn(1);
      this.iconStore._onWindowFocus();
      const { path } = getCallData();
      expect(path).toBe(INBOX_FULL_ICON);
    });

    it('shows inbox full /alt/ icon ONLY when window is currently blurred and total count changes', () => {
      this.iconStore._windowBackgrounded = false;
      this.iconStore._onWindowBlur();
      expect(ipcRenderer.send).not.toHaveBeenCalled();

      // BadgeStore triggers a change
      spyOn(BadgeStore, 'total').andReturn(1);
      this.iconStore._updateIcon();

      const { path } = getCallData();
      expect(path).toBe(INBOX_FULL_UNREAD_ICON);
    });

    it('does not show inbox full /alt/ icon when window is currently focused and total count changes', () => {
      this.iconStore._windowBackgrounded = false;

      // BadgeStore triggers a change
      spyOn(BadgeStore, 'total').andReturn(1);
      this.iconStore._updateIcon();

      const { path } = getCallData();
      expect(path).toBe(INBOX_FULL_ICON);
    });
  });
});
