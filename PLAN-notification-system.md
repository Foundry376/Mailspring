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
│  │ (Notifier class)    │    │ ipcRenderer.invoke('notify')    ││
│  └─────────────────────┘    └─────────────────────────────────┘│
└───────────────────────────────────┬─────────────────────────────┘
                                    │ IPC
┌───────────────────────────────────▼─────────────────────────────┐
│  Main Process                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ notification-manager.ts                                     ││
│  │ - Electron Notification module                              ││
│  │ - Platform-specific features (hasReply, actions, toastXml)  ││
│  │ - Event forwarding back to renderer                         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Files to Create/Modify

### New Files
1. `app/src/browser/notification-manager.ts` - Main process notification handler

### Modified Files
1. `app/src/native-notifications.ts` - Convert to IPC bridge
2. `app/src/browser/application.ts` - Register notification IPC handlers
3. `app/internal_packages/unread-notifications/lib/main.ts` - Handle reply/action events

---

## Step 1: Create Main Process Notification Manager

**File: `app/src/browser/notification-manager.ts`**

```typescript
import { Notification, ipcMain, BrowserWindow, nativeImage } from 'electron';
import path from 'path';

interface NotificationOptions {
  id: string;                    // Unique ID for tracking
  title: string;
  subtitle?: string;             // macOS only
  body?: string;
  tag?: string;
  icon?: string;
  threadId?: string;             // For action callbacks
  messageId?: string;            // For action callbacks

  // Platform-specific
  hasReply?: boolean;            // macOS: enable inline reply
  replyPlaceholder?: string;     // macOS: placeholder text
  actions?: Array<{              // macOS: action buttons
    type: 'button';
    text: string;
  }>;
  urgency?: 'low' | 'normal' | 'critical';  // Linux
  timeoutType?: 'default' | 'never';         // Linux, Windows
  toastXml?: string;             // Windows: custom toast XML
}

class NotificationManager {
  private activeNotifications: Map<string, Notification> = new Map();
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.registerIPCHandlers();
  }

  private registerIPCHandlers() {
    // Handle notification display requests
    ipcMain.handle('notification:display', async (event, options: NotificationOptions) => {
      return this.displayNotification(options);
    });

    // Handle notification close requests
    ipcMain.handle('notification:close', async (event, id: string) => {
      this.closeNotification(id);
    });

    // Handle close all for a thread
    ipcMain.handle('notification:close-thread', async (event, threadId: string) => {
      this.closeNotificationsForThread(threadId);
    });
  }

  private displayNotification(options: NotificationOptions): string | null {
    const platform = process.platform;

    // Build platform-appropriate notification options
    const notifOptions: Electron.NotificationConstructorOptions = {
      title: options.title,
      body: options.body || options.subtitle,
      icon: options.icon ? nativeImage.createFromPath(options.icon) : undefined,
      silent: true, // We handle sounds separately
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

    // Store metadata for event handling
    const metadata = {
      threadId: options.threadId,
      messageId: options.messageId,
    };

    // Handle click event
    notification.on('click', () => {
      this.sendToRenderer('notification:clicked', {
        id: options.id,
        ...metadata,
      });
    });

    // Handle close event
    notification.on('close', () => {
      this.activeNotifications.delete(options.id);
      this.sendToRenderer('notification:closed', { id: options.id });
    });

    // Handle reply event (macOS)
    notification.on('reply', (event, reply) => {
      this.sendToRenderer('notification:replied', {
        id: options.id,
        reply,
        ...metadata,
      });
    });

    // Handle action event (macOS)
    notification.on('action', (event, index) => {
      this.sendToRenderer('notification:action', {
        id: options.id,
        actionIndex: index,
        ...metadata,
      });
    });

    // Handle failed event (Windows)
    notification.on('failed', (event, error) => {
      console.error('Notification failed:', error);
    });

    notification.show();
    this.activeNotifications.set(options.id, notification);

    return options.id;
  }

  private closeNotification(id: string) {
    const notification = this.activeNotifications.get(id);
    if (notification) {
      notification.close();
      this.activeNotifications.delete(id);
    }
  }

  private closeNotificationsForThread(threadId: string) {
    // This requires tracking threadId -> notification mapping
    // Implementation depends on how we store this metadata
  }

  private sendToRenderer(channel: string, data: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

export default new NotificationManager();
```

---

## Step 2: Update native-notifications.ts (Renderer Process)

**File: `app/src/native-notifications.ts`**

Convert to use IPC bridge instead of Web Notification API:

```typescript
import { ipcRenderer } from 'electron';
import { v4 as uuid } from 'uuid';

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
  private callbacks: Map<string, INotificationCallback> = new Map();
  private resolvedIcon: string = null;

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
          actionIndex: data.actionIndex
        });
      }
    });

    ipcRenderer.on('notification:closed', (event, data) => {
      this.callbacks.delete(data.id);
    });
  }

  async doNotDisturb(): Promise<boolean> {
    // Keep existing macOS DND check
    if (process.platform === 'darwin') {
      try {
        return await require('macos-notification-state').getDoNotDisturb();
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  private getIcon(): string {
    // Keep existing icon resolution logic
    // ... (unchanged from current implementation)
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

    const id = uuid();

    // Store callback for later
    this.callbacks.set(id, onActivate);

    // Build platform-specific options
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

    // macOS features
    if (process.platform === 'darwin') {
      if (canReply) {
        options.hasReply = true;
        options.replyPlaceholder = replyPlaceholder || 'Reply...';
      }
      if (actions) {
        options.actions = actions;
      }
    }

    // Windows toast XML (when actions are requested)
    if (process.platform === 'win32' && actions && actions.length > 0) {
      options.toastXml = this.buildWindowsToastXml({
        title,
        subtitle,
        body,
        actions,
        threadId,
      });
    }

    await ipcRenderer.invoke('notification:display', options);

    return {
      id,
      close: () => {
        ipcRenderer.invoke('notification:close', id);
        this.callbacks.delete(id);
      },
    };
  }

  private buildWindowsToastXml(options: {
    title: string;
    subtitle?: string;
    body?: string;
    actions?: Array<{ type: 'button'; text: string }>;
    threadId?: string;
  }): string {
    const actionsXml = options.actions
      ?.map((action, i) =>
        `<action content="${action.text}" arguments="action:${i}:${options.threadId}" />`
      )
      .join('\n') || '';

    return `
      <toast launch="mailspring:thread/${options.threadId}" activationType="protocol">
        <visual>
          <binding template="ToastGeneric">
            <text>${this.escapeXml(options.title)}</text>
            ${options.subtitle ? `<text>${this.escapeXml(options.subtitle)}</text>` : ''}
            ${options.body ? `<text>${this.escapeXml(options.body)}</text>` : ''}
          </binding>
        </visual>
        ${actionsXml ? `<actions>${actionsXml}</actions>` : ''}
      </toast>
    `;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  closeNotificationsForThread(threadId: string) {
    ipcRenderer.invoke('notification:close-thread', threadId);
  }
}

export default new NativeNotifications();
```

---

## Step 3: Register IPC Handlers in Application

**File: `app/src/browser/application.ts`**

Add notification manager initialization:

```typescript
// Add import at top
import notificationManager from './notification-manager';

// In handleEvents() method, add:
ipcMain.handle('notification:display', async (event, options) => {
  return notificationManager.displayNotification(options);
});

ipcMain.handle('notification:close', async (event, id) => {
  notificationManager.closeNotification(id);
});

ipcMain.handle('notification:close-thread', async (event, threadId) => {
  notificationManager.closeNotificationsForThread(threadId);
});

// In openWindowsForTokenState() or when main window is ready:
const mainWindow = this.windowManager.get(WindowManager.MAIN_WINDOW);
if (mainWindow) {
  notificationManager.initialize(mainWindow.browserWindow);
}
```

---

## Step 4: Update unread-notifications Plugin

**File: `app/internal_packages/unread-notifications/lib/main.ts`**

Update to use new notification features:

```typescript
// In _notifyOne method, update the notification call:
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
    title,
    subtitle,
    body,
    tag: `thread-${thread.id}`,  // Unique per thread
    threadId: thread.id,
    messageId: message.id,

    // macOS inline reply
    canReply: true,
    replyPlaceholder: `Reply to ${from}...`,

    // macOS action buttons
    actions: [
      { type: 'button', text: localized('Mark as Read') },
      { type: 'button', text: localized('Archive') },
    ],

    onActivate: ({ response, activationType, actionIndex }) => {
      if (activationType === 'replied' && response) {
        Actions.sendQuickReply({ thread, message }, response);
      } else if (activationType === 'action') {
        this._handleNotificationAction(actionIndex, thread, message);
      } else if (activationType === 'clicked') {
        AppEnv.displayWindow();
        Actions.ensureCategoryIsFocused('inbox', thread.accountId);
        Actions.setFocus({ collection: 'thread', item: thread });
      }
    },
  });

  // Track notification for dismissal when thread is read
  if (notification) {
    if (!this.activeNotifications[thread.id]) {
      this.activeNotifications[thread.id] = [];
    }
    this.activeNotifications[thread.id].push(notification);
  }
}

// New method to handle action button clicks
_handleNotificationAction(actionIndex: number, thread: Thread, message: Message) {
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
        TaskFactory.taskForMovingToTrash({
          threads: [thread],
          source: 'Notification Action',
        })
      );
      break;
  }
}

// Update _onThreadsChanged to use new close method
_onThreadsChanged(threads) {
  threads.forEach(({ id, unread }) => {
    if (!unread && this.activeNotifications[id]) {
      // Use the new close method on notification handles
      this.activeNotifications[id].forEach(n => n.close());
      delete this.activeNotifications[id];
    }
  });
}
```

---

## Step 5: Add Required Dependencies

**File: `app/package.json`**

```json
{
  "dependencies": {
    "uuid": "^9.0.0"  // For generating notification IDs
  }
}
```

---

## Platform Feature Matrix

| Feature | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Inline Reply | `hasReply: true` | Not supported | Not supported |
| Action Buttons | `actions: [...]` | `toastXml` with `<actions>` | Limited via libnotify |
| Urgency/Priority | Not supported | Not supported | `urgency: 'critical'` |
| Persistent | Not supported | `timeoutType: 'never'` | `timeoutType: 'never'` |
| Custom Sound | `sound: 'name'` | Via toast XML | Not supported |

---

## Testing Plan

1. **macOS Testing**
   - [ ] Notification displays with title, subtitle, body
   - [ ] Inline reply field appears and sends quick reply
   - [ ] Action buttons appear and trigger correct actions
   - [ ] Notification dismissed when thread marked read

2. **Windows Testing**
   - [ ] Toast notification displays correctly
   - [ ] Action buttons work via toast XML
   - [ ] Protocol activation handles thread navigation
   - [ ] Notifications persist in Action Center

3. **Linux Testing**
   - [ ] Basic notification displays
   - [ ] Urgency levels work (may depend on DE)
   - [ ] Click callback works

4. **Cross-Platform**
   - [ ] Do Not Disturb respected
   - [ ] Multiple notifications queue correctly
   - [ ] Notification sound plays
   - [ ] Badge count updates correctly

---

## Migration Notes

1. **Backward Compatibility**: The `displayNotification` API signature changes slightly but remains compatible
2. **Fallback**: If main process notification fails, could fall back to Web API
3. **Icon Resolution**: Keep existing Linux icon resolution logic
4. **Thread Tracking**: `activeNotifications` now stores `NotificationHandle` objects instead of raw `Notification` objects

---

## Estimated Scope

- **New code**: ~300 lines (notification-manager.ts)
- **Modified code**: ~150 lines (native-notifications.ts) + ~50 lines (main.ts) + ~20 lines (application.ts)
- **Files touched**: 4 files
