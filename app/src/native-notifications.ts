/* eslint global-require: 0 */
import { ipcRenderer } from 'electron';
import { convertToPNG, getIcon, Context } from './linux-theme-utils';
import { getDoNotDisturb as getMacDoNotDisturb } from './dnd-utils-macos';
import { getDoNotDisturb as getLinuxDoNotDisturb } from './dnd-utils-linux';
import { getDoNotDisturb as getWindowsDoNotDisturb } from './dnd-utils-windows';
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

/**
 * Options passed via IPC to the main process for displaying notifications.
 * This matches the NotificationOptions interface in notification-ipc.ts.
 */
interface IIPCNotificationOptions {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  tag?: string;
  icon?: string;
  threadId?: string;
  messageId?: string;
  hasReply?: boolean;
  replyPlaceholder?: string;
  actions?: Array<{ type: 'button'; text: string }>;
  urgency?: 'low' | 'normal' | 'critical';
  timeoutType?: 'default' | 'never';
}

class NativeNotifications {
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
        this.callbacks.delete(data.id);
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
        this.callbacks.delete(data.id);
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
    if (platform === 'darwin') return getMacDoNotDisturb();
    if (platform === 'linux') return getLinuxDoNotDisturb();
    if (platform === 'win32') return getWindowsDoNotDisturb();
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

  /**
   * Format an array of sender names into a human-readable string.
   * Uses proper English formatting: "X", "X and Y", "X, Y, and Z", "X, Y, and N others"
   *
   * @param senders Array of sender display names
   * @returns Formatted string or empty string if no senders
   */
  private formatSenderList(senders: string[]): string {
    if (senders.length === 0) {
      return '';
    } else if (senders.length === 1) {
      return senders[0];
    } else if (senders.length === 2) {
      return `${senders[0]} and ${senders[1]}`;
    } else if (senders.length === 3) {
      return `${senders[0]}, ${senders[1]}, and ${senders[2]}`;
    } else {
      return `${senders[0]}, ${senders[1]}, and ${senders.length - 2} others`;
    }
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
    const options: IIPCNotificationOptions = {
      id,
      title,
      subtitle,
      body,
      tag,
      icon: this.resolvedIcon,
      threadId,
      messageId,
    };

    // macOS and Windows support inline reply and action buttons natively
    if (platform === 'darwin' || platform === 'win32') {
      if (canReply) {
        options.hasReply = true;
        options.replyPlaceholder = replyPlaceholder || 'Reply...';
      }
      if (actions && actions.length > 0) {
        options.actions = actions;
      }
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

  /**
   * Display a summary notification for multiple unread messages.
   *
   * @param count Number of unread messages
   * @param senders Array of sender names (will show up to 3)
   * @param onActivate Callback when notification is clicked
   */
  async displaySummaryNotification({
    count,
    senders = [],
    onActivate = () => {},
  }: {
    count: number;
    senders?: string[];
    onActivate?: INotificationCallback;
  }): Promise<NotificationHandle | null> {
    if (await this.doNotDisturb()) {
      return null;
    }

    const id = this.generateId();
    this.callbacks.set(id, onActivate);

    const sendersText = this.formatSenderList(senders);

    const options: IIPCNotificationOptions = {
      id,
      title: `${count} new messages`,
      subtitle: sendersText || undefined,
      body: 'Click to view your inbox',
      tag: 'unread-summary',
      icon: this.resolvedIcon,
    };

    try {
      await ipcRenderer.invoke('notification:display', options);
    } catch (err) {
      console.error('Failed to display summary notification:', err);
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
}

export default new NativeNotifications();
