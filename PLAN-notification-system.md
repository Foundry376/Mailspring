# Implementation Plan: Enhanced Notification System

## Overview

Migrate from Web Notification API (renderer process) to Electron's main process Notification module to enable platform-specific features: macOS inline reply, macOS action buttons, and Windows rich toast notifications.

## Architecture Change

```
CURRENT:
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process                                               │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐│
│  │ unread-notifications│───▶│ native-notifications.ts         ││
│  │ (Notifier class)    │    │ new Notification() - Web API    ││
│  └─────────────────────┘    └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

PROPOSED:
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process                                               │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐│
│  │ unread-notifications│───▶│ native-notifications.ts         ││
│  │ (Notifier class)    │    │ ipcRenderer.invoke(...)         ││
│  └─────────────────────┘    └─────────────────────────────────┘│
└───────────────────────────────────┬─────────────────────────────┘
                                    │ IPC
┌───────────────────────────────────▼─────────────────────────────┐
│  Main Process                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ notification-ipc.ts (registerNotificationIPCHandlers)       ││
│  │ - Uses Electron Notification module                         ││
│  │ - Platform-specific features (hasReply, actions, toastXml)  ││
│  │ - Events forwarded back via windowManager.sendToAllWindows()││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## IPC Patterns (from codebase review)

Based on review of existing IPC implementations:

1. **quickpreview-ipc.ts pattern**: Export a `registerXxxIPCHandlers(ipcMain)` function, called from `application.ts`
2. **badge-store.ts pattern**: Simple `ipcRenderer.send()` / `ipcMain.on()` for one-way communication
3. **window-manager.ts**: Use `sendToAllWindows()` for broadcasting events to all renderer windows
4. **No new dependencies**: Use existing `Utils.generateTempId()` or `crypto.randomUUID()` instead of adding uuid package

## Files to Create/Modify

### New Files
1. `app/src/browser/notification-ipc.ts` - IPC handlers and notification logic (main process)

### Modified Files
1. `app/src/native-notifications.ts` - Convert to IPC bridge (keep same export API)
2. `app/src/browser/application.ts` - Register notification IPC handlers
3. `app/internal_packages/unread-notifications/lib/main.ts` - Use new features

---

## Step 1: Create Notification IPC Handlers

**File: `app/src/browser/notification-ipc.ts`**

Following the `quickpreview-ipc.ts` pattern:

```typescript
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
```

---

## Step 2: Update native-notifications.ts (Renderer Process)

**File: `app/src/native-notifications.ts`**

Convert to IPC bridge while maintaining the same export API:

```typescript
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
  private _macNotificationsByTag = {};
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

  // Keep existing Linux icon resolution logic
  private readIconFromDesktopFile(filePath) {
    if (fs.existsSync(filePath)) {
      const ini = require('ini');
      const content = ini.parse(fs.readFileSync(filePath, 'utf-8'));
      return content['Desktop Entry']['Icon'];
    }
    return null;
  }

  private getIcon() {
    if (platform === 'linux') {
      const desktopBaseDirs = [
        os.homedir() + '/.local/share/applications/',
        '/usr/share/applications/',
      ];
      const desktopFileNames = ['mailspring.desktop', 'Mailspring.desktop'];
      for (const baseDir of desktopBaseDirs) {
        for (const fileName of desktopFileNames) {
          const filePath = path.join(baseDir, fileName);
          const desktopIcon = this.readIconFromDesktopFile(filePath);
          if (desktopIcon != null) {
            if (fs.existsSync(desktopIcon)) {
              return desktopIcon;
            }
            const iconPath = getIcon(desktopIcon, 64, Context.APPLICATIONS, 2);
            if (iconPath != null) {
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
```

---

## Step 3: Register IPC Handlers in Application

**File: `app/src/browser/application.ts`**

Add registration call in `handleEvents()`:

```typescript
// Add import at top of file
import { registerNotificationIPCHandlers } from './notification-ipc';

// In handleEvents() method, after other ipcMain registrations:
registerNotificationIPCHandlers(ipcMain);
```

---

## Step 4: Update unread-notifications Plugin

**File: `app/internal_packages/unread-notifications/lib/main.ts`**

Update to use new notification features:

```typescript
// Add TaskFactory to imports
import {
  Thread,
  Actions,
  AccountStore,
  Message,
  SoundRegistry,
  NativeNotifications,
  DatabaseStore,
  localized,
  DatabaseChangeRecord,
  TaskFactory,  // Add this import
} from 'mailspring-exports';

// ... existing code ...

// Update _notifyOne method:
async _notifyOne({ message, thread }) {
  const from = message.from[0] ? message.from[0].displayName() : 'Unknown';
  const title = from;
  let subtitle = null;
  let body = null;
  if (message.subject && message.subject.length > 0) {
    subtitle = message.subject;
    body = message.snippet;
  } else {
    subtitle = message.snippet;
    body = null;
  }

  const notification = await NativeNotifications.displayNotification({
    title: title,
    subtitle: subtitle,
    body: body,
    tag: `thread-${thread.id}`,
    threadId: thread.id,
    messageId: message.id,

    // macOS inline reply
    canReply: true,
    replyPlaceholder: localized('Reply to %@...', from),

    // macOS action buttons
    actions: [
      { type: 'button', text: localized('Mark as Read') },
      { type: 'button', text: localized('Archive') },
    ],

    onActivate: ({ response, activationType, actionIndex }) => {
      if (activationType === 'replied' && response && typeof response === 'string') {
        Actions.sendQuickReply({ thread, message }, response);
      } else if (activationType === 'action') {
        this._handleNotificationAction(actionIndex, thread);
      } else if (activationType === 'clicked') {
        AppEnv.displayWindow();
        if (!thread) {
          AppEnv.showErrorDialog(`Can't find that thread`);
          return;
        }
        Actions.ensureCategoryIsFocused('inbox', thread.accountId);
        Actions.setFocus({ collection: 'thread', item: thread });
      }
    },
  });

  if (notification) {
    if (!this.activeNotifications[thread.id]) {
      this.activeNotifications[thread.id] = [notification];
    } else {
      this.activeNotifications[thread.id].push(notification);
    }
  }
}

// Add new method to handle action button clicks
_handleNotificationAction(actionIndex: number, thread: Thread) {
  AppEnv.displayWindow();

  switch (actionIndex) {
    case 0: // Mark as Read
      Actions.queueTask(
        TaskFactory.taskForSettingUnread({
          threads: [thread],
          unread: false,
          source: 'Notification Action',
        })
      );
      break;
    case 1: // Archive
      Actions.queueTask(
        TaskFactory.taskForArchiving({
          threads: [thread],
          source: 'Notification Action',
        })
      );
      break;
  }
}
```

---

## Platform Feature Matrix

| Feature | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Inline Reply | `hasReply: true` | Not supported | Not supported |
| Action Buttons | `actions: [...]` | `toastXml` with `<actions>` | Limited (depends on DE) |
| Urgency/Priority | Not supported | Not supported | `urgency: 'critical'` |
| Persistent | Not supported | `timeoutType: 'never'` | `timeoutType: 'never'` |
| Custom Sound | `sound: 'name'` | Via toast XML | Not supported |

---

## Testing Plan

1. **macOS Testing**
   - [ ] Notification displays with title, subtitle, body
   - [ ] Inline reply field appears when clicking reply
   - [ ] Typing reply and pressing Enter sends quick reply
   - [ ] Action buttons appear and trigger correct actions
   - [ ] Notification dismissed when thread marked read

2. **Windows Testing**
   - [ ] Toast notification displays correctly
   - [ ] Action buttons work via toast XML
   - [ ] Click navigates to thread
   - [ ] Notifications appear in Action Center

3. **Linux Testing**
   - [ ] Basic notification displays with correct icon
   - [ ] Click callback works
   - [ ] Urgency levels work (may depend on DE)

4. **Cross-Platform**
   - [ ] Do Not Disturb respected on macOS
   - [ ] Multiple notifications queue correctly (2-second delay)
   - [ ] Notification sound plays
   - [ ] Badge count updates correctly
   - [ ] Notifications dismiss when thread read

---

## Migration Notes

1. **API Compatibility**: The `displayNotification` method now returns a `NotificationHandle` object instead of a raw `Notification`. The handle has `id` and `close()` properties.

2. **Callback Signature**: The `onActivate` callback now receives an additional `actionIndex` property for action button clicks.

3. **Icon Resolution**: Linux icon resolution logic is preserved unchanged.

4. **Error Handling**: Failures in IPC communication are caught and logged; the method returns `null` on failure.

5. **No New Dependencies**: Uses built-in `crypto.randomUUID()` instead of adding uuid package.

---

## Estimated Scope

- **New code**: ~150 lines (notification-ipc.ts)
- **Modified code**: ~100 lines (native-notifications.ts) + ~50 lines (main.ts) + ~3 lines (application.ts)
- **Files touched**: 4 files
