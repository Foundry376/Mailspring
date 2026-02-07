import { app, ipcMain, nativeImage, NativeImage } from 'electron';
import { localized } from '../intl';
import Application from './application';

/**
 * Manages Windows-specific taskbar integration features:
 * - Jump Lists (right-click taskbar menu with quick actions)
 * - Overlay Icons (unread mail indicator on taskbar icon)
 * - Thumbnail Toolbar Buttons (compose/inbox buttons on taskbar preview)
 * - Progress Bar (sync progress on taskbar icon)
 * - Flash Frame (flash taskbar on new mail)
 */
class WindowsTaskbarManager {
  private _application: Application;
  private _overlayIcon: NativeImage | null = null;

  constructor(application: Application) {
    this._application = application;
    this._setupJumpList();
    this._registerIpcHandlers();
    this._setupThumbnailToolbar();
  }

  /**
   * Set up the Windows Jump List with quick actions.
   * Jump Lists appear when users right-click the app's taskbar icon.
   */
  private _setupJumpList() {
    try {
      app.setJumpList([
        {
          type: 'tasks',
          items: [
            {
              type: 'task',
              title: localized('Compose New Message'),
              description: localized('Open a new email composer window'),
              program: process.execPath,
              args: '--mailto mailto:',
              iconPath: process.execPath,
              iconIndex: 0,
            },
            {
              type: 'task',
              title: localized('Inbox'),
              description: localized('Open your inbox'),
              program: process.execPath,
              args: '--open-inbox',
              iconPath: process.execPath,
              iconIndex: 0,
            },
            {
              type: 'separator',
            },
            {
              type: 'task',
              title: localized('Preferences'),
              description: localized('Open Mailspring preferences'),
              program: process.execPath,
              args: '--preferences',
              iconPath: process.execPath,
              iconIndex: 0,
            },
          ],
        },
      ]);
    } catch (e) {
      console.warn('Failed to set Windows Jump List:', e);
    }
  }

  /**
   * Register IPC handlers for Windows taskbar features.
   */
  private _registerIpcHandlers() {
    // Overlay icon: updated when badge/unread count changes
    ipcMain.on('set-overlay-icon', (_event, unreadCount: number) => {
      this._updateOverlayIcon(unreadCount);
    });

    // Progress bar: updated when sync progress changes
    ipcMain.on('set-taskbar-progress', (_event, progress: number) => {
      this._updateProgressBar(progress);
    });

    // Flash frame: triggered when new mail arrives
    ipcMain.on('flash-taskbar', () => {
      this._flashFrame();
    });
  }

  /**
   * Set up thumbnail toolbar buttons on the main window's taskbar preview.
   * These buttons appear when users hover over the app in the taskbar.
   */
  private _setupThumbnailToolbar() {
    // Wait for the main window to be created and shown
    const setupButtons = () => {
      const mainWin = this._application.getMainWindow();
      if (!mainWin) {
        // Retry after a delay if main window isn't ready yet
        setTimeout(setupButtons, 3000);
        return;
      }

      try {
        const composeIcon = this._createComposeIcon();
        const calendarIcon = this._createCalendarIcon();

        mainWin.setThumbarButtons([
          {
            tooltip: localized('Compose New Message'),
            icon: composeIcon,
            click: () => {
              this._application.emit('application:new-message');
              mainWin.show();
            },
          },
          {
            tooltip: localized('Calendar'),
            icon: calendarIcon,
            click: () => {
              this._application.emit('application:show-calendar');
            },
          },
        ]);
      } catch (e) {
        console.warn('Failed to set thumbnail toolbar buttons:', e);
      }
    };

    // Delay to ensure main window is available
    app.whenReady().then(() => {
      setTimeout(setupButtons, 5000);
    });
  }

  /**
   * Update the taskbar overlay icon based on unread count.
   * Shows a small badge with the unread count, or clears it when zero.
   */
  private _updateOverlayIcon(unreadCount: number) {
    const mainWin = this._application.getMainWindow();
    if (!mainWin) return;

    try {
      if (unreadCount <= 0) {
        mainWin.setOverlayIcon(null, '');
        this._overlayIcon = null;
        return;
      }

      const text = unreadCount > 99 ? '99+' : String(unreadCount);
      const icon = this._createBadgeIcon(text);
      this._overlayIcon = icon;
      mainWin.setOverlayIcon(
        icon,
        `${unreadCount} ${unreadCount === 1 ? 'unread message' : 'unread messages'}`
      );
    } catch (e) {
      console.warn('Failed to set overlay icon:', e);
    }
  }

  /**
   * Update the taskbar progress bar based on sync progress.
   * @param progress - A number between 0 and 1, or -1 to clear, or -2 for indeterminate
   */
  private _updateProgressBar(progress: number) {
    const mainWin = this._application.getMainWindow();
    if (!mainWin) return;

    try {
      if (progress < 0) {
        mainWin.setProgressBar(-1); // Clear progress bar
      } else if (progress >= 1) {
        // Briefly show complete, then clear
        mainWin.setProgressBar(1, { mode: 'normal' });
        setTimeout(() => {
          try {
            mainWin.setProgressBar(-1);
          } catch (_) {
            // Window may have been destroyed
          }
        }, 2000);
      } else {
        mainWin.setProgressBar(progress, { mode: 'normal' });
      }
    } catch (e) {
      console.warn('Failed to set taskbar progress:', e);
    }
  }

  /**
   * Flash the taskbar button to attract attention for new mail.
   * Only flashes if the main window is not focused.
   */
  flashFrame() {
    this._flashFrame();
  }

  private _flashFrame() {
    const mainWin = this._application.getMainWindow();
    if (!mainWin) return;

    try {
      // Only flash if the window is not currently focused
      if (!mainWin.isFocused()) {
        mainWin.flashFrame(true);
        // Stop flashing after a few seconds to avoid being annoying
        setTimeout(() => {
          try {
            mainWin.flashFrame(false);
          } catch (_) {
            // Window may have been destroyed
          }
        }, 5000);
      }
    } catch (e) {
      console.warn('Failed to flash frame:', e);
    }
  }

  /**
   * Create a small badge icon with text for the overlay.
   * Draws a colored circle with the unread count text.
   */
  private _createBadgeIcon(text: string): NativeImage {
    // Create a 16x16 data URL with a simple colored badge
    const size = 16;
    const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#2979ff"/>
      <text x="${size / 2}" y="${size / 2 + 1}" text-anchor="middle" dominant-baseline="central"
        fill="white" font-family="Segoe UI, Arial, sans-serif" font-size="${
          text.length > 2 ? 7 : 9
        }" font-weight="bold">${text}</text>
    </svg>`;

    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`;
    return nativeImage.createFromDataURL(dataUrl);
  }

  /**
   * Create a compose icon for the thumbnail toolbar.
   */
  private _createComposeIcon(): NativeImage {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <path fill="#ffffff" d="M13.5 2.5l-1-1L5 9v2h2l7.5-7.5zM2 13h12v1H2v-1zM3 4v7h2.5L14 2.5 13.5 2 5 10.5H4V4H3z"/>
    </svg>`;
    return nativeImage.createFromDataURL(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    );
  }

  /**
   * Create a calendar icon for the thumbnail toolbar.
   */
  private _createCalendarIcon(): NativeImage {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <path fill="#ffffff" d="M4 0v2H2C.9 2 0 2.9 0 4v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2h-2V0h-2v2H6V0H4zM2 6h12v8H2V6zm2 2v2h2V8H4zm4 0v2h2V8H8zm4 0v2h2V8h-2z"/>
    </svg>`;
    return nativeImage.createFromDataURL(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    );
  }
}

export default WindowsTaskbarManager;
