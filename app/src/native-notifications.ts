/* eslint global-require: 0 */
const platform = process.platform;

let MacNotifierNotification = null;
if (platform === 'darwin') {
  try {
    MacNotifierNotification = require('node-mac-notifier');
  } catch (err) {
    console.error(
      'node-mac-notifier (a platform-specific optionalDependency) was not installed correctly! Check the Travis build log for errors.'
    );
  }
}

type INotificationCallback = (
  args: { response: string | null; activationType: 'replied' | 'clicked' }
) => any;

class NativeNotifications {
  _macNotificationsByTag = {};

  constructor() {
    if (MacNotifierNotification) {
      AppEnv.onBeforeUnload(() => {
        Object.keys(this._macNotificationsByTag).forEach(key => {
          this._macNotificationsByTag[key].close();
        });
        return true;
      });
    }
  }

  doNotDisturb() {
    if (platform === 'win32' && require('windows-quiet-hours').getIsQuietHours()) {
      return true;
    }
    if (platform === 'darwin' && require('macos-notification-state').getDoNotDisturb()) {
      return true;
    }
    return false;
  }

  displayNotification({
    title,
    subtitle,
    body,
    tag,
    canReply,
    onActivate = args => {},
  }: {
    title?: string;
    subtitle?: string;
    body?: string;
    tag?: string;
    canReply?: boolean;
    onActivate?: INotificationCallback;
  } = {}) {
    let notif = null;

    if (this.doNotDisturb()) {
      return null;
    }

    if (MacNotifierNotification) {
      if (tag && this._macNotificationsByTag[tag]) {
        this._macNotificationsByTag[tag].close();
      }
      notif = new MacNotifierNotification(title, {
        bundleId: 'com.mailspring.mailspring',
        canReply: canReply,
        subtitle: subtitle,
        body: body,
        id: tag,
      });
      notif.addEventListener('reply', ({ response }) => {
        onActivate({ response, activationType: 'replied' });
      });
      notif.addEventListener('click', () => {
        onActivate({ response: null, activationType: 'clicked' });
      });
      if (tag) {
        this._macNotificationsByTag[tag] = notif;
      }
    } else {
      notif = new Notification(title, {
        silent: true,
        body: subtitle,
        tag: tag,
      });
      notif.onclick = onActivate;
    }
    return notif;
  }
}

export default new NativeNotifications();
