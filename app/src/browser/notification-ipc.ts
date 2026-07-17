import { Notification, IpcMain, IpcMainInvokeEvent, nativeImage } from 'electron';
import path from 'path';
import { UrlWithParsedQuery } from 'url';
import { ICON_PATHS } from '../utils/xdg-paths';

interface NotificationOptions {
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

const handledWindowsToastXMLProtocolActionsForIds: string[] = [];

// Track active notifications by ID, with metadata for thread-based dismissal
const activeNotifications = new Map<string, { notification: Notification; threadId?: string }>();

/**
 * Validate that an icon path is within allowed directories.
 * This prevents the renderer from specifying arbitrary file paths that could
 * expose sensitive files or cause security issues.
 *
 * Allowed paths:
 * - Application's static resources (resourcePath/static/)
 * - System icon directories on Linux (/usr/share/icons/, ~/.local/share/icons/)
 * - System temp directory (for converted PNG icons on Linux)
 *
 * Uses path.resolve() to prevent directory traversal attacks.
 */
const validateIconPath = (iconPath: string | undefined): string | null => {
  if (!iconPath) {
    return null;
  }

  const resolvedIcon = path.resolve(iconPath);
  const platform = process.platform;

  // Always allow paths within the application's static resources
  const resourcePath = global.application?.resourcePath;
  if (resourcePath) {
    const staticPath = path.resolve(resourcePath, 'static');
    // Append path.sep to prevent prefix-matching attacks (e.g., /static-evil/)
    if (resolvedIcon.startsWith(staticPath + path.sep)) {
      return resolvedIcon;
    }
  }

  // On Linux, also allow system icon directories and temp directory
  if (platform === 'linux') {
    for (const allowedPath of ICON_PATHS) {
      if (resolvedIcon.startsWith(allowedPath + path.sep)) {
        return resolvedIcon;
      }
    }
  }

  console.warn(`Notification icon path rejected - not within allowed directories: ${iconPath}`);
  return null;
};

/**
 * Send notification event back to all renderer windows.
 * Uses global.application.windowManager which is available in main process.
 */
const sendToAllWindows = (channel: string, data: any) => {
  if (global.application?.windowManager) {
    global.application.windowManager.sendToAllWindows(channel, {}, data);
  }
};

/**
 * Display a notification using Electron's Notification API.
 * Handles platform-specific options for macOS, Windows, and Linux.
 */
const displayNotification = (
  event: IpcMainInvokeEvent,
  options: NotificationOptions
): string | null => {
  const platform = process.platform;

  // Check if notifications are supported
  if (!Notification.isSupported()) {
    console.warn('Notifications are not supported on this system');
    return null;
  }

  // Validate icon path to ensure it's within allowed directories
  const validatedIconPath = validateIconPath(options.icon);

  // Build platform-appropriate notification options
  const notifOptions: Electron.NotificationConstructorOptions = {
    title: options.title,
    body: options.subtitle || options.body,
    icon: validatedIconPath ? nativeImage.createFromPath(validatedIconPath) : undefined,
    silent: true, // App handles sounds separately via SoundRegistry
  };

  // macOS-specific options
  if (platform === 'darwin') {
    if (options.subtitle && options.body) {
      notifOptions.subtitle = options.subtitle;
      notifOptions.body = options.body;
    }
    if (options.hasReply) {
      notifOptions.hasReply = true;
      notifOptions.replyPlaceholder = options.replyPlaceholder || 'Reply...';
    }
    if (options.actions && options.actions.length > 0) {
      notifOptions.actions = options.actions;
    }
  }

  // Linux-specific options
  if (platform === 'linux') {
    if (options.urgency) {
      notifOptions.urgency = options.urgency;
    }
    if (options.timeoutType) {
      notifOptions.timeoutType = options.timeoutType;
    }
  }

  // Windows-specific options
  if (platform === 'win32') {
    if (options.toastXml) {
      notifOptions.toastXml = options.toastXml;
    } else if (options.timeoutType) {
      notifOptions.timeoutType = options.timeoutType;
    }
  }

  const notification = new Notification(notifOptions);

  // Handle click event
  notification.on('click', () => {
    const payload = {
      id: options.id,
      threadId: options.threadId,
      messageId: options.messageId,
    };
    if (process.platform === 'win32') {
      // On Windows with toastXml + activationType="protocol", clicks are routed through
      // the OS protocol handler (mailspring:// URLs) rather than Electron's Activated callback,
      // but this event still fires first. It seems worth handling it in case the protocol handler
      // fails, since it's a big of a fragile approach, but we need to wait and let the event arrive
      // from the second-instance that is launched to handle the URL.
      setTimeout(() => {
        if (handledWindowsToastXMLProtocolActionsForIds.includes(payload.id)) {
          return;
        }
        sendToAllWindows('notification:clicked', payload);
      }, 1500);
    } else {
      sendToAllWindows('notification:clicked', payload);
    }
  });

  // Handle close event
  notification.on('close', () => {
    activeNotifications.delete(options.id);
    sendToAllWindows('notification:closed', { id: options.id });
  });

  // Handle reply event (macOS only)
  notification.on('reply', (replyEvent, reply) => {
    sendToAllWindows('notification:replied', {
      id: options.id,
      reply,
      threadId: options.threadId,
      messageId: options.messageId,
    });
  });

  // Handle action button event (macOS only)
  notification.on('action', (actionEvent, index) => {
    sendToAllWindows('notification:action', {
      id: options.id,
      actionIndex: index,
      threadId: options.threadId,
      messageId: options.messageId,
    });
  });

  // Handle failed event (Windows only)
  notification.on('failed', (failedEvent, error) => {
    console.error('Notification failed:', error);
  });

  notification.show();
  activeNotifications.set(options.id, {
    notification,
    threadId: options.threadId,
  });

  // On Windows, flash the taskbar to attract attention for new mail
  if (platform === 'win32' && global.application?.windowsTaskbarManager) {
    global.application.windowsTaskbarManager.flashFrame();
  }

  return options.id;
};

/**
 * Close a specific notification by ID.
 */
const closeNotification = (event: IpcMainInvokeEvent, id: string): void => {
  const entry = activeNotifications.get(id);
  if (entry) {
    entry.notification.close();
    activeNotifications.delete(id);
  }
};

/**
 * Register all notification-related IPC handlers.
 * Called from application.ts during startup.
 */
export function registerNotificationIPCHandlers(ipcMain: IpcMain) {
  ipcMain.handle('notification:display', displayNotification);
  ipcMain.handle('notification:close', closeNotification);
}

export function handleWindowsToastXMLProtocolAction(parts: UrlWithParsedQuery) {
  const payload = {
    id: parts.query.id as string,
    threadId: parts.query.threadId as string,
    messageId: parts.query.messageId as string,
  };

  handledWindowsToastXMLProtocolActionsForIds.unshift(payload.id);
  handledWindowsToastXMLProtocolActionsForIds.splice(10);

  if (parts.host === 'notification-click') {
    sendToAllWindows('notification:clicked', payload);
  } else if (parts.host === 'notification-action') {
    const actionIndex = parseInt(parts.query.actionIndex as string, 10);
    sendToAllWindows('notification:action', { ...payload, actionIndex });
  }
}
