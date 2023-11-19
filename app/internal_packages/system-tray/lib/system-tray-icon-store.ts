import path from 'path';
import { ipcRenderer } from 'electron';
import { BadgeStore } from 'mailspring-exports';

// Must be absolute real system path
// https://github.com/atom/electron/issues/1299
const { platform } = process;
const { nativeTheme } = require("@electron/remote");

/*
Current / Intended Behavior:

- If your inbox is at "Inbox Zero", we use an empty looking icon in the tray.

- If the app is in the foreground, we show a gray "full mailbox" icon.

- If the app is in the backgrorund, WHEN the count changes, we switch to showing
  a red "new mail in your mailbox" icon. (Eg: going from 4 unread to 5 unread
  will trigger it.)

- If you have unread mail, we show a blue "unread mail in your mailbox" icon. (Eg:
  new mail arrives, icon initially shows red, but when you foregrounded the app,
  it will switch to blue.)
*/
class SystemTrayIconStore {

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

    // If the theme changes from bright to dark mode or vice versa, we need to update the tray icon
    nativeTheme.on('updated', () => {
      this._updateIcon();
    })
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

  // This implementation is windows only.
  // On Mac the icon color is automatically inverted
  // Linux ships with the icons used for a dark tray only
  _dark = () => {
    if (nativeTheme.shouldUseDarkColors && process.platform === 'win32') {
      return "-dark";
    }
    return "";
  }

  inboxZeroIcon = () => {
    return path.join(__dirname, '..', 'assets', platform, `MenuItem-Inbox-Zero${this._dark()}.png`);
  }

  inboxFullIcon = () => {
    return path.join(__dirname, '..', 'assets', platform, `MenuItem-Inbox-Full${this._dark()}.png`);
  }

  inboxFullNewIcon = () => {
    return path.join(
      __dirname,
      '..',
      'assets',
      platform,
      `MenuItem-Inbox-Full-NewItems${this._dark()}.png`
    );
  }

  inboxFullUnreadIcon = () => {
    return path.join(
      __dirname,
      '..',
      'assets',
      platform,
      `MenuItem-Inbox-Full-UnreadItems${this._dark()}.png`
    );
  }

  _updateIcon = () => {
    const unread = BadgeStore.unread();
    const unreadString = (+unread).toLocaleString();
    const isInboxZero = BadgeStore.total() === 0;

    const newMessagesIconStyle = AppEnv.config.get('core.workspace.trayIconStyle') || 'blue';

    let icon = { path: this.inboxFullIcon(), isTemplateImg: true };
    if (isInboxZero) {
      icon = { path: this.inboxZeroIcon(), isTemplateImg: true };
    } else if (unread !== 0) {
      if (newMessagesIconStyle === 'blue') {
        icon = { path: this.inboxFullUnreadIcon(), isTemplateImg: false };
      } else {
        if (this._windowBackgrounded) {
          icon = { path: this.inboxFullNewIcon(), isTemplateImg: false };
        } else {
          icon = { path: this.inboxFullUnreadIcon(), isTemplateImg: false };
        }
      }
    }
    ipcRenderer.send('update-system-tray', icon.path, unreadString, icon.isTemplateImg);
  };
}

export default SystemTrayIconStore;
