import { Notification, IpcMain, IpcMainInvokeEvent, nativeImage } from 'electron';

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

// Track active notifications by ID, with metadata for thread-based dismissal
const activeNotifications = new Map<string, { notification: Notification; threadId?: string }>();

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

  // Build platform-appropriate notification options
  const notifOptions: Electron.NotificationConstructorOptions = {
    title: options.title,
    body: options.subtitle || options.body,
    icon: options.icon ? nativeImage.createFromPath(options.icon) : undefined,
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
    sendToAllWindows('notification:clicked', {
      id: options.id,
      threadId: options.threadId,
      messageId: options.messageId,
    });
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
 * Close all notifications for a specific thread.
 * Called when user reads a thread to dismiss related notifications.
 */
const closeNotificationsForThread = (event: IpcMainInvokeEvent, threadId: string): void => {
  for (const [id, entry] of activeNotifications.entries()) {
    if (entry.threadId === threadId) {
      entry.notification.close();
      activeNotifications.delete(id);
    }
  }
};

/**
 * Register all notification-related IPC handlers.
 * Called from application.ts during startup.
 */
export function registerNotificationIPCHandlers(ipcMain: IpcMain) {
  ipcMain.handle('notification:display', displayNotification);
  ipcMain.handle('notification:close', closeNotification);
  ipcMain.handle('notification:close-for-thread', closeNotificationsForThread);
}
