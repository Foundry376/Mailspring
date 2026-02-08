/* eslint global-require: 0 */
import { ipcRenderer } from 'electron';
import { convertToPNG, getIcon, Context } from './linux-theme-utils';
import { getDoNotDisturb as getLinuxDoNotDisturb } from './linux-dnd-utils';
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
  toastXml?: string;
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
    if (platform === 'linux') {
      try {
        return await getLinuxDoNotDisturb();
      } catch (e) {
        console.warn('Failed to check Linux Do Not Disturb status:', e);
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

  /**
   * Safely escape a string for use in XML content using browser DOM APIs.
   * This handles the full UTF-8 range including Chinese characters and other
   * international text, as well as any special characters in untrusted email input.
   */
  private escapeXml(str: string): string {
    if (!str) return '';
    // Use the DOM's XMLSerializer to properly escape text for XML.
    // Creating a text node and serializing it handles all XML special characters.
    const doc = document.implementation.createDocument(null, 'root', null);
    const textNode = doc.createTextNode(str);
    return new XMLSerializer().serializeToString(textNode);
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

  /**
   * Build Windows toast XML following Microsoft's best practices for email notifications.
   * See: https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/adaptive-interactive-toasts
   *
   * @param options Notification options
   * @returns Toast XML string
   */
  private buildWindowsToastXml(options: {
    id: string;
    title: string;
    subtitle?: string;
    body?: string;
    actions?: Array<{ type: 'button'; text: string }>;
    threadId?: string;
    messageId?: string;
    replyPlaceholder?: string;
    canReply?: boolean;
  }): string {
    // Build URL query parameters for protocol activation
    // These are used to route actions back through the app's URL handler
    // We use URLSearchParams for proper URL encoding, then XML-escape the full URL
    const baseParams = new URLSearchParams({
      id: options.id,
      threadId: options.threadId || '',
      messageId: options.messageId || '',
    }).toString();

    // Build action buttons XML using protocol activation
    // Note: Windows supports up to 5 buttons total (including reply button)
    const actionsContent = (options.actions || [])
      .map((action, i) => {
        const actionUrl = `mailspring://notification-action?${baseParams}&actionIndex=${i}`;
        return `    <action content="${this.escapeXml(action.text)}" arguments="${this.escapeXml(
          actionUrl
        )}" activationType="protocol"/>`;
      })
      .join('\n');

    const actionsXml = actionsContent ? `  <actions>\n${actionsContent}\n  </actions>` : '';

    // Build the complete toast XML
    // - hint-maxLines="1" prevents sender name from wrapping
    // - group attribute enables notification stacking per thread
    // - activationType="protocol" allows handling when app is closed
    const clickUrl = `mailspring://notification-click?${baseParams}`;
    return `<toast launch="${this.escapeXml(
      clickUrl
    )}" activationType="protocol" group="thread-${options.threadId || 'default'}">
  <visual>
    <binding template="ToastGeneric">
      <text hint-maxLines="1">${this.escapeXml(options.title)}</text>
      ${options.subtitle ? `<text>${this.escapeXml(options.subtitle)}</text>` : ''}
      ${
        options.body
          ? `<text hint-style="captionSubtle">${this.escapeXml(options.body)}</text>`
          : ''
      }
    </binding>
  </visual>
${actionsXml}
</toast>`;
  }

  /**
   * Build Windows toast XML for a summary notification (multiple unread messages).
   * Used when there are 5+ unread messages to avoid notification spam.
   *
   * @param count Number of unread messages
   * @param senders Array of sender names to display
   * @returns Toast XML string
   */
  private buildWindowsSummaryToastXml(id: string, count: number, senders: string[]): string {
    const sendersText = this.formatSenderList(senders);

    const baseParams = new URLSearchParams({
      id: id,
      threadId: '',
      messageId: '',
    }).toString();

    const clickUrl = `mailspring://notification-click?${baseParams}`;

    return `<toast launch="${this.escapeXml(clickUrl)}" activationType="protocol">
  <visual>
    <binding template="ToastGeneric">
      <text hint-maxLines="1">${count} new messages</text>
      ${sendersText ? `<text>${this.escapeXml(sendersText)}</text>` : ''}
      <text hint-style="captionSubtle">Click to view your inbox</text>
    </binding>
  </visual>
  <actions>
    <action content="View Inbox" arguments="${this.escapeXml(clickUrl)}" activationType="protocol"/>
    <action content="Dismiss" arguments="dismiss" activationType="system"/>
  </actions>
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

    // Windows toast XML for rich notifications with actions and/or reply
    if (platform === 'win32' && (actions?.length > 0 || canReply)) {
      options.toastXml = this.buildWindowsToastXml({
        id,
        title,
        subtitle,
        body,
        actions,
        threadId,
        messageId,
        canReply,
        replyPlaceholder,
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

  /**
   * Display a summary notification for multiple unread messages.
   * On Windows, this uses a special toast XML format optimized for summaries.
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

    // Use special summary toast XML on Windows
    if (platform === 'win32') {
      options.toastXml = this.buildWindowsSummaryToastXml(id, count, senders);
    }

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
