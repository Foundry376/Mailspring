/* eslint global-require: 0 */
import { convertToPNG, getIcon, Context } from './linux-theme-utils';
import path from 'path';
import fs from 'fs';
import os from 'os';

const platform = process.platform;
const DEFAULT_ICON = path.resolve(__dirname, '..', 'build', 'resources', 'mailspring.png');

const ICON_CACHE = {};

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

  /**
   * Check if the desktop file exists and parse the desktop file for the icon.
   *
   * @param {string} filePath to the desktop file
   * @returns {string} icon from the desktop file
   */
  readIconFromDesktopFile(filePath) {
    if (fs.existsSync(filePath)) {
      const ini = require('ini');
      const content = ini.parse(fs.readFileSync(filePath, 'utf-8'));
      return content['Desktop Entry']['Icon'];
    }
    return null;
  }

  /**
   * Get notification icon. Only works on linux, otherwise the Mailspring default icon wil be read
   * from resources.
   *
   * Reading the icon name from the desktop file of Mailspring. If the icon is a name, reads the
   * icon theme directory for this icon. As the notification only works with PNG files, SVG files
   * must be converted to PNG
   *
   * @returns {string} path to the icon
   * @private
   */
  __getIcon() {
    if (platform === 'linux') {
      const desktopBaseDirs = [
        os.homedir() + '/.local/share/applications/',
        '/usr/share/applications/',
      ];
      const desktopFileNames = ['mailspring.desktop', 'Mailspring.desktop'];
      // check the applications directories, the user directory has a higher priority
      for (const baseDir of desktopBaseDirs) {
        // check multiple spellings
        for (const fileName of desktopFileNames) {
          const filePath = path.join(baseDir, fileName);
          const desktopIcon = this.readIconFromDesktopFile(filePath);
          if (desktopIcon != null) {
            if (fs.existsSync(desktopIcon)) {
              // icon is a file and can be returned
              return desktopIcon;
            }
            // icon is a name and we need to get it from the icon theme
            const iconPath = getIcon(desktopIcon || 'mailspring', 64, Context.APPLICATIONS, 2);
            if (iconPath != null) {
              // only .png icons work with notifications
              if (path.extname(iconPath) === '.png') {
                return iconPath;
              }
              // try to read it from cache
              if (ICON_CACHE.hasOwnProperty(iconPath)) {
                if (fs.existsSync(ICON_CACHE[iconPath])) {
                  return ICON_CACHE[iconPath];
                }
              }
              const converted = convertToPNG(desktopIcon, iconPath);
              if (converted != null) {
                // save the icon to a cache so we do not create a new tmp file for each notification
                ICON_CACHE[iconPath] = converted;
                return converted;
              }
            }
          }
        }
      }
    }
    return DEFAULT_ICON;
  }

  displayNotification({ title, subtitle, body, tag, canReply, onActivate = () => {} } = {}) {
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
        icon: this.__getIcon(),
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
        icon: this.__getIcon(),
      });
      notif.onclick = onActivate;
    }
    return notif;
  }
}

export default new NativeNotifications();
