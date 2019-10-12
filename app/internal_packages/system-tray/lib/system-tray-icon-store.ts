import path from 'path';
import { ipcRenderer, remote } from 'electron';
import { BadgeStore } from 'mailspring-exports';

// Must be absolute real system path
// https://github.com/atom/electron/issues/1299
const { platform } = process;
const INBOX_ZERO_ICON = path.join(__dirname, '..', 'assets', platform, 'MenuItem-Inbox-Zero.png');
const INBOX_FULL_ICON = path.join(__dirname, '..', 'assets', platform, 'MenuItem-Inbox-Full.png');
const INBOX_FULL_UNREAD_ICON = path.join(
  __dirname,
  '..',
  'assets',
  platform,
  'MenuItem-Inbox-Full-NewItems.png'
);

/*
Current / Intended Behavior:

- If your inbox is at "Inbox Zero", we use an empty looking icon in the tray.

- If the app is in the foreground, we show a gray "full mailbox" icon.

- If the app is in the backgrorund, WHEN the count changes, we switch to showing
  a blue "new mail in your mailbox" icon. (Eg: going from 4 unread to 5 unread
  will trigger it.)

The blue is meant to reflect "new stuff since you last foregrounded the app",
not an absolute count of unread messages. This is a very old design decision (2014?)
and maybe it should be reconsidered soon.
*/
class SystemTrayIconStore {
  static INBOX_ZERO_ICON = INBOX_ZERO_ICON;

  static INBOX_FULL_ICON = INBOX_FULL_ICON;

  static INBOX_FULL_UNREAD_ICON = INBOX_FULL_UNREAD_ICON;

  _windowBackgrounded = false;
  _unsubscribers: (() => void)[];

  activate() {
    setTimeout(() => {
      this._updateIcon();
    }, 2000);
    this._unsubscribers = [];
    this._unsubscribers.push(BadgeStore.listen(this._updateIcon));

    window.addEventListener('browser-window-show', this._onWindowFocus);
    window.addEventListener('browser-window-focus', this._onWindowFocus);
    window.addEventListener('browser-window-hide', this._onWindowBackgrounded);
    window.addEventListener('browser-window-blur', this._onWindowBackgrounded);
    this._unsubscribers.push(() => {
      window.removeEventListener('browser-window-show', this._onWindowFocus);
      window.removeEventListener('browser-window-focus', this._onWindowFocus);
      window.removeEventListener('browser-window-hide', this._onWindowBackgrounded);
      window.removeEventListener('browser-window-blur', this._onWindowBackgrounded);
    });
  }

  deactivate() {
    this._unsubscribers.forEach(unsub => unsub());
  }

  _onWindowBackgrounded = () => {
    // Set state to blurred, but don't trigger a change. The icon should only be
    // updated when the count changes
    this._windowBackgrounded = true;
  };

  _onWindowFocus = () => {
    // Make sure that as long as the window is focused we never use the alt icon
    this._windowBackgrounded = false;
    this._updateIcon();
  };

  _updateIcon = () => {
    const unread = BadgeStore.unread();
    const unreadString = (+unread).toLocaleString();
    const isInboxZero = BadgeStore.total() === 0;

    let icon = { path: INBOX_FULL_ICON, isTemplateImg: true };
    if (isInboxZero) {
      icon = { path: INBOX_ZERO_ICON, isTemplateImg: true };
    } else if (this._windowBackgrounded && unread !== 0) {
      icon = { path: INBOX_FULL_UNREAD_ICON, isTemplateImg: false };
    }
    ipcRenderer.send('update-system-tray', icon.path, unreadString, icon.isTemplateImg);
  };
}

export default SystemTrayIconStore;
