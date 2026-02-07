import { app, ipcMain, nativeImage, NativeImage } from 'electron';
import { localized } from '../intl';
import Application from './application';

const MAX_THUMBNAIL_SETUP_RETRIES = 5;

/**
 * Manages Windows-specific taskbar integration features:
 * - Jump Lists (right-click taskbar menu with quick actions)
 * - Overlay Icons (unread mail indicator on taskbar icon)
 * - Thumbnail Toolbar Buttons (compose/inbox buttons on taskbar preview)
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
   *
   * Uses mailto: and mailspring: protocol URLs so that clicks are routed
   * through the existing protocol handler in application.ts, which works
   * for both first launch and second-instance scenarios.
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
              args: 'mailto:',
              iconPath: process.execPath,
              iconIndex: 0,
            },
            {
              type: 'task',
              title: localized('Inbox'),
              description: localized('Open your inbox'),
              program: process.execPath,
              args: 'mailspring://open-inbox',
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
              args: 'mailspring://open-preferences',
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

    // Flash frame: triggered when new mail arrives
    ipcMain.on('flash-taskbar', () => {
      this._flashFrame();
    });
  }

  /**
   * Set up thumbnail toolbar buttons on the main window's taskbar preview.
   * These buttons appear when users hover over the app in the taskbar.
   * Retries up to MAX_THUMBNAIL_SETUP_RETRIES times if the main window
   * is not yet available.
   */
  private _setupThumbnailToolbar() {
    let retries = 0;

    const setupButtons = () => {
      const mainWin = this._application.getMainWindow();
      if (!mainWin) {
        retries++;
        if (retries <= MAX_THUMBNAIL_SETUP_RETRIES) {
          setTimeout(setupButtons, 3000);
        }
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
   * Create a small 16x16 badge icon with text for the overlay.
   * Uses createFromBitmap with BGRA pixel order, which is the native
   * bitmap format on Windows.
   */
  private _createBadgeIcon(text: string): NativeImage {
    const size = 16;
    const buf = Buffer.alloc(size * size * 4, 0);

    // Draw a filled blue circle (r=8, center=8,8)
    const cx = 8,
      cy = 8,
      r = 8;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.sqrt((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2);
        if (dist <= r) {
          // Anti-alias the edge
          const alpha = Math.min(1, r - dist + 0.5);
          const i = (y * size + x) * 4;
          // Blue badge: #2979FF in BGRA order
          buf[i] = 0xff; // B
          buf[i + 1] = 0x79; // G
          buf[i + 2] = 0x29; // R
          buf[i + 3] = Math.round(alpha * 255); // A
        }
      }
    }

    // Draw white text digits using simple 3x5 pixel font bitmaps
    const glyphs = this._getDigitGlyphs();
    const chars = text.split('');
    const charWidth = 4; // 3px glyph + 1px spacing
    const totalWidth = chars.length * charWidth - 1;
    const startX = Math.round((size - totalWidth) / 2);
    const startY = Math.round((size - 5) / 2);

    for (let c = 0; c < chars.length; c++) {
      const glyph = glyphs[chars[c]];
      if (!glyph) continue;
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          if (glyph[gy] & (1 << (2 - gx))) {
            const px = startX + c * charWidth + gx;
            const py = startY + gy;
            if (px >= 0 && px < size && py >= 0 && py < size) {
              const i = (py * size + px) * 4;
              buf[i] = 0xff; // B
              buf[i + 1] = 0xff; // G
              buf[i + 2] = 0xff; // R
              buf[i + 3] = 0xff; // A
            }
          }
        }
      }
    }

    return nativeImage.createFromBitmap(buf, { width: size, height: size });
  }

  /**
   * 3x5 pixel font bitmaps for digits 0-9 and '+'.
   * Each row is a 3-bit value (MSB = leftmost pixel).
   */
  private _getDigitGlyphs(): { [ch: string]: number[] } {
    return {
      '0': [0b111, 0b101, 0b101, 0b101, 0b111],
      '1': [0b010, 0b110, 0b010, 0b010, 0b111],
      '2': [0b111, 0b001, 0b111, 0b100, 0b111],
      '3': [0b111, 0b001, 0b111, 0b001, 0b111],
      '4': [0b101, 0b101, 0b111, 0b001, 0b001],
      '5': [0b111, 0b100, 0b111, 0b001, 0b111],
      '6': [0b111, 0b100, 0b111, 0b101, 0b111],
      '7': [0b111, 0b001, 0b001, 0b001, 0b001],
      '8': [0b111, 0b101, 0b111, 0b101, 0b111],
      '9': [0b111, 0b101, 0b111, 0b001, 0b111],
      '+': [0b000, 0b010, 0b111, 0b010, 0b000],
    };
  }

  /**
   * Create a 16x16 compose (pencil) icon for the thumbnail toolbar.
   * Uses createFromBitmap with BGRA pixel order (white pixels are
   * channel-order-independent).
   */
  private _createComposeIcon(): NativeImage {
    const size = 16;
    const buf = Buffer.alloc(size * size * 4, 0);

    const setPixel = (x: number, y: number) => {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const i = (y * size + x) * 4;
        buf[i] = 0xff; // B
        buf[i + 1] = 0xff; // G
        buf[i + 2] = 0xff; // R
        buf[i + 3] = 0xff; // A
      }
    };

    // Draw a pencil/compose icon:
    // Diagonal line from (4,11) to (11,4) for the pencil body
    for (let d = 0; d <= 7; d++) {
      setPixel(4 + d, 11 - d);
      setPixel(5 + d, 11 - d);
    }
    // Pencil tip at bottom-left
    setPixel(3, 12);
    // Horizontal line at bottom for the paper
    for (let x = 2; x <= 13; x++) {
      setPixel(x, 14);
    }

    return nativeImage.createFromBitmap(buf, { width: size, height: size });
  }

  /**
   * Create a 16x16 calendar icon for the thumbnail toolbar.
   * Uses createFromBitmap with BGRA pixel order (white pixels are
   * channel-order-independent).
   */
  private _createCalendarIcon(): NativeImage {
    const size = 16;
    const buf = Buffer.alloc(size * size * 4, 0);

    const setPixel = (x: number, y: number) => {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const i = (y * size + x) * 4;
        buf[i] = 0xff; // B
        buf[i + 1] = 0xff; // G
        buf[i + 2] = 0xff; // R
        buf[i + 3] = 0xff; // A
      }
    };

    // Calendar outline: rect from (2,3) to (13,14)
    for (let x = 2; x <= 13; x++) {
      setPixel(x, 3); // top
      setPixel(x, 14); // bottom
    }
    for (let y = 3; y <= 14; y++) {
      setPixel(2, y); // left
      setPixel(13, y); // right
    }
    // Header divider line at y=6
    for (let x = 2; x <= 13; x++) {
      setPixel(x, 6);
    }
    // Two binding rings at top
    for (let y = 1; y <= 4; y++) {
      setPixel(5, y);
      setPixel(10, y);
    }
    // Grid dots in the body (3x3 grid of small marks)
    for (const gx of [4, 7, 10]) {
      for (const gy of [8, 10, 12]) {
        setPixel(gx, gy);
        setPixel(gx + 1, gy);
      }
    }

    return nativeImage.createFromBitmap(buf, { width: size, height: size });
  }
}

export default WindowsTaskbarManager;
