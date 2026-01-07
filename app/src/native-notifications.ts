/* eslint global-require: 0 */
import { ipcRenderer } from 'electron';
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

type INotificationCallback = (args: {
  response: string | null;
  activationType: 'replied' | 'clicked' | 'action';
  actionIndex?: number;
}) => any;

type INotificationOptions = {
  title?: string;
  subtitle?: string;
  body?: string;
  tag?: string;
  canReply?: boolean;
  replyPlaceholder?: string;
  actions?: Array<{ type: 'button'; text: string }>;
  threadId?: string;
  messageId?: string;
  onActivate?: INotificationCallback;
};

interface NotificationHandle {
  id: string;
  close: () => void;
}

class NativeNotifications {
  _macNotificationsByTag = {};
  private resolvedIcon: string = null;
  private callbacks: Map<string, INotificationCallback> = new Map();

  constructor() {
    this.resolvedIcon = this.getIcon();
    this.registerIPCListeners();
  }

  private registerIPCListeners() {
    ipcRenderer.on('notification:clicked', (event, data) => {
      const callback = this.callbacks.get(data.id);
      if (callback) {
        callback({ response: null, activationType: 'clicked' });
      }
    });

    ipcRenderer.on('notification:replied', (event, data) => {
      const callback = this.callbacks.get(data.id);
      if (callback) {
        callback({ response: data.reply, activationType: 'replied' });
      }
      this.callbacks.delete(data.id);
    });

    ipcRenderer.on('notification:action', (event, data) => {
      const callback = this.callbacks.get(data.id);
      if (callback) {
        callback({
          response: null,
          activationType: 'action',
          actionIndex: data.actionIndex,
        });
      }
    });

    ipcRenderer.on('notification:closed', (event, data) => {
      this.callbacks.delete(data.id);
    });
  }

  async doNotDisturb(): Promise<boolean> {
    if (platform === 'darwin') {
      try {
        return await require('macos-notification-state').getDoNotDisturb();
      } catch (e) {
        console.warn('Failed to check Do Not Disturb status:', e);
        return false;
      }
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

  private generateId(): string {
    // Use crypto.randomUUID() which is available in modern Node/Electron
    return crypto.randomUUID();
  }

  private escapeXml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private buildWindowsToastXml(options: {
    title: string;
    subtitle?: string;
    body?: string;
    actions?: Array<{ type: 'button'; text: string }>;
    threadId?: string;
  }): string {
    const actionsXml =
      options.actions
        ?.map(
          (action, i) =>
            `<action content="${this.escapeXml(action.text)}" arguments="action:${i}:${options.threadId || ''}" />`
        )
        .join('\n') || '';

    return `<toast launch="mailspring:thread/${options.threadId || ''}" activationType="protocol">
  <visual>
    <binding template="ToastGeneric">
      <text>${this.escapeXml(options.title)}</text>
      ${options.subtitle ? `<text>${this.escapeXml(options.subtitle)}</text>` : ''}
      ${options.body ? `<text>${this.escapeXml(options.body)}</text>` : ''}
    </binding>
  </visual>
  ${actionsXml ? `<actions>${actionsXml}</actions>` : ''}
</toast>`;
  }

  async displayNotification({
    title,
    subtitle,
    body,
    tag,
    canReply,
    replyPlaceholder,
    actions,
    threadId,
    messageId,
    onActivate = () => {},
  }: INotificationOptions = {}): Promise<NotificationHandle | null> {
    if (await this.doNotDisturb()) {
      return null;
    }

    const id = this.generateId();

    // Store callback for later event handling
    this.callbacks.set(id, onActivate);

    // Build options for main process
    const options: any = {
      id,
      title,
      subtitle,
      body,
      tag,
      icon: this.resolvedIcon,
      threadId,
      messageId,
    };

    // macOS-specific features
    if (platform === 'darwin') {
      if (canReply) {
        options.hasReply = true;
        options.replyPlaceholder = replyPlaceholder || 'Reply...';
      }
      if (actions && actions.length > 0) {
        options.actions = actions;
      }
    }

    // Windows toast XML for action buttons
    if (platform === 'win32' && actions && actions.length > 0) {
      options.toastXml = this.buildWindowsToastXml({
        title,
        subtitle,
        body,
        actions,
        threadId,
      });
    }

    try {
      await ipcRenderer.invoke('notification:display', options);
    } catch (err) {
      console.error('Failed to display notification:', err);
      this.callbacks.delete(id);
      return null;
    }

    return {
      id,
      close: () => {
        ipcRenderer.invoke('notification:close', id);
        this.callbacks.delete(id);
      },
    };
  }

  closeNotificationsForThread(threadId: string) {
    ipcRenderer.invoke('notification:close-for-thread', threadId);
  }
}

export default new NativeNotifications();
