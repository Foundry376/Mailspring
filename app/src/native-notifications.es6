/* eslint global-require: 0 */
let MacNotifierNotification = null;
// if (process.platform === 'darwin') {
try {
  MacNotifierNotification = require('node-notifier').NotificationCenter;
} catch (err) {
  console.error(
    'node-notifier (a platform-specific optionalDependency) was not installed correctly! Check the Travis build log for errors.'
  );
}
// }

class NativeNotifications {
  constructor() {
    if (MacNotifierNotification) {
      this._macNotificationsByTag = {};
      this.notif = new MacNotifierNotification();
      AppEnv.onBeforeUnload(() => {
        Object.keys(this._macNotificationsByTag).forEach(key => {
          this._macNotificationsByTag[key].close();
        });
        return true;
      });
    }
  }
  displayNotification({ title, subtitle, body, tag, canReply, onActivate = () => { } } = {}) {
    if (MacNotifierNotification) {
      if (!this.notif) {
        this.notif = new MacNotifierNotification();
      }
      const notifData = {
        title,
        subtitle,
        message: body,
        sound: false,
        sender: 'com.edisonmail.edisonmail',
        // New in latest version. See `example/macInput.js` for usage
        timeout: 20, // -1 means do not timeout
        // closeLabel: 'close', // String. Label for cancel button
        // actions: ['action1', 'action2'],
        // dropdownLabel: 'more', // String. Label to be used if multiple actions
        group: tag,
        remove: tag,
        reply: canReply ? '' : undefined
      };
      this.notif.notify(notifData,
        function (error, response, metadata) {
          if (error) {
            console.error('Notification Error:', error, notifData);
          }
          if (metadata.activationType === 'replied') {
            onActivate({ response: metadata.activationValue, activationType: 'replied' });
          }
          else if (
            metadata.activationType === 'contentsClicked'
            || (metadata.activationType == "actionClicked" && !metadata.activationValue)
          ) {
            onActivate({ response: null, activationType: 'clicked' });
          }
        }
      );
    } else {
      this.notif = new Notification(title, {
        silent: true,
        body: subtitle,
        tag: tag,
      });
      this.notif.onclick = onActivate;
    }
    return this.notif;
  }
}

export default new NativeNotifications();
