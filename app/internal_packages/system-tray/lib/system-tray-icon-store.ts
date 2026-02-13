import path from 'path';
import { ipcRenderer } from 'electron';
import { BadgeStore } from 'mailspring-exports';

// Must be absolute real system path
// https://github.com/atom/electron/issues/1299
const { platform } = process;
const { nativeTheme } = require('@electron/remote');

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
    this._updateIcon();
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

  // On Mac the icon color is automatically inverted via isTemplateImg.
  // On Windows and Linux we ship separate dark/light icon variants.
  // Returns '-dark' when we need a light icon (for dark backgrounds).
  _dark = () => {
    if (process.platform === 'win32') {
      return nativeTheme.shouldUseDarkColors ? '-dark' : '';
    }
    if (process.platform === 'linux') {
      // On GNOME/Unity the top bar panel is always dark regardless of the
      // application theme, so nativeTheme.shouldUseDarkColors is unreliable
      // for choosing the tray icon variant. Default to the light-on-dark icon.
      const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toUpperCase();
      if (desktop.includes('GNOME') || desktop.includes('UNITY')) {
        return '-dark';
      }
      return nativeTheme.shouldUseDarkColors ? '-dark' : '';
    }
    return '';
  };

  inboxZeroIcon = () => {
    return path.join(__dirname, '..', 'assets', platform, `MenuItem-Inbox-Zero${this._dark()}.png`);
  };

  inboxFullIcon = () => {
    return path.join(__dirname, '..', 'assets', platform, `MenuItem-Inbox-Full${this._dark()}.png`);
  };

  inboxFullNewIcon = () => {
    return path.join(
      __dirname,
      '..',
      'assets',
      platform,
      `MenuItem-Inbox-Full-NewItems${this._dark()}.png`
    );
  };

  inboxFullUnreadIcon = () => {
    return path.join(
      __dirname,
      '..',
      'assets',
      platform,
      `MenuItem-Inbox-Full-UnreadItems${this._dark()}.png`
    );
  };

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
