/* eslint global-require: 0 */
import { convertToPNG, getIcon, Context } from './linux-theme-utils';
import path from 'path';
import fs from 'fs';
import os from 'os';

const platform = process.platform;
const DEFAULT_ICON = path.resolve(
  AppEnv.getLoadSettings().resourcePath,
  'static',
  'images',
  'mailspring.png'
);

type INotificationCallback = (
  args: { response: string | null; activationType: 'replied' | 'clicked' }
) => any;

type INotificationOptions = {
  title?: string;
  subtitle?: string;
  body?: string;
  tag?: string;
  canReply?: boolean;
  onActivate?: INotificationCallback;
};

class NativeNotifications {
  _macNotificationsByTag = {};
  private resolvedIcon: string = null;

  constructor() {
    this.resolvedIcon = this.getIcon();
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
   * @private
   */
  private readIconFromDesktopFile(filePath) {
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
  private getIcon() {
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
            const iconPath = getIcon(desktopIcon, 64, Context.APPLICATIONS, 2);
            if (iconPath != null) {
              // only .png icons work with notifications
              if (path.extname(iconPath) === '.png') {
                return iconPath;
              }
              const converted = convertToPNG(desktopIcon, iconPath);
              if (converted != null) {
                return converted;
              }
            }
          }
        }
      }
    }
    return DEFAULT_ICON;
  }

  displayNotification({
    title,
    subtitle,
    body,
    tag,
    canReply,
    onActivate = args => { },
  }: INotificationOptions = {}) {
    let notif = null;

    if (this.doNotDisturb()) {
      return null;
    }

    notif = new Notification(title, {
      silent: true,
      body: subtitle,
      tag: tag,
      icon: this.resolvedIcon,
    });
    notif.onclick = onActivate;
    return notif;
  }
}

export default new NativeNotifications();
