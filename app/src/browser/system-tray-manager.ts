import path from 'path';
import { Tray, Menu, nativeImage, nativeTheme } from 'electron';
import { localized } from '../intl';
import Application from './application';

function _getMenuTemplate(platform: string, application: Application) {
  const template = [
    {
      label: localized('New Message'),
      click: () => application.emit('application:new-message'),
    },
    {
      label: localized('Preferences'),
      click: () => application.emit('application:open-preferences'),
    },
    {
      type: 'separator',
    },
    {
      label: localized('Quit Mailspring'),
      click: () => application.emit('application:quit'),
    },
  ];

  if (platform !== 'win32') {
    template.unshift({
      label: `${localized('Open')} ${localized('Inbox')}`,
      click: () => application.emit('application:show-main-window'),
    });
  }

  return template;
}

function _getTooltip(unreadString: string) {
  return unreadString ? `${unreadString} unread messages` : '';
}

function _getIcon(iconPath: string) {
  if (!iconPath) {
    return nativeImage.createEmpty();
  }
  return nativeImage.createFromPath(iconPath);
}

// Chromium's tray backend only picks the AppIndicator/StatusNotifierItem
// implementation when XDG_CURRENT_DESKTOP matches one of these values (a
// holdover from Ubuntu Unity). Every other desktop, including compositors
// that implement the StatusNotifierItem host themselves (Hyprland, Sway,
// i3+snixembed, etc.), falls back to the legacy X11 XEmbed tray icon, which
// has no XEmbed manager to embed into on Wayland — so the icon silently
// never appears. Reporting as Unity just for the Tray() construction call
// gets Chromium to use the SNI backend without touching the real
// XDG_CURRENT_DESKTOP value that the rest of the app (dark-panel icon
// selection, DND detection) still relies on to identify the actual desktop.
const APPINDICATOR_DESKTOPS = ['GNOME', 'UNITY'];

function _withAppIndicatorDesktop<T>(fn: () => T): T {
  if (process.platform !== 'linux') return fn();

  const original = process.env.XDG_CURRENT_DESKTOP;
  const current = (original || '').toUpperCase();
  if (APPINDICATOR_DESKTOPS.some((d) => current.includes(d))) return fn();

  process.env.XDG_CURRENT_DESKTOP = 'Unity';
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.XDG_CURRENT_DESKTOP;
    } else {
      process.env.XDG_CURRENT_DESKTOP = original;
    }
  }
}

class SystemTrayManager {
  _iconPath = null;
  _unreadString = null;
  _tray = null;
  _platform: string = null;
  _application: Application;

  constructor(platform: string, application: Application) {
    this._platform = platform;
    this._application = application;
    this.initTray();

    this._application.config.onDidChange('core.workspace.systemTray', ({ newValue }) => {
      if (newValue === false) {
        this.destroyTray();
      } else {
        this.initTray();
      }
    });
  }

  _defaultIconPath() {
    if (this._platform !== 'linux') return null;

    const traySystemTheme =
      this._application.config.get('core.workspace.traySystemTheme') || 'automatic';
    let dark: string;
    if (traySystemTheme === 'dark') {
      dark = '-dark';
    } else if (traySystemTheme === 'light') {
      dark = '';
    } else {
      // Automatic: On GNOME/Unity the top bar panel is always dark regardless of the
      // application theme, so nativeTheme.shouldUseDarkColors is unreliable
      // for choosing the tray icon variant. Default to the light-on-dark icon.
      const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toUpperCase();
      if (desktop.includes('GNOME') || desktop.includes('UNITY')) {
        dark = '-dark';
      } else {
        dark = nativeTheme.shouldUseDarkColors ? '-dark' : '';
      }
    }

    return path.join(
      this._application.resourcePath,
      'internal_packages',
      'system-tray',
      'assets',
      'linux',
      `MenuItem-Inbox-Full${dark}.png`
    );
  }

  initTray() {
    const enabled = this._application.config.get('core.workspace.systemTray') !== false;
    const created = this._tray !== null;

    if (enabled && !created) {
      _withAppIndicatorDesktop(() => {
        this._tray = new Tray(_getIcon(this._iconPath || this._defaultIconPath()));
        this._tray.setToolTip(_getTooltip(this._unreadString));
        this._tray.addListener('click', this._onClick);
        this._tray.setContextMenu(
          Menu.buildFromTemplate(_getMenuTemplate(this._platform, this._application) as any)
        );
      });
    }
  }

  _onClick = () => {
    if (this._platform !== 'darwin') {
      if (this._application.windowManager.getVisibleWindowCount() === 0) {
        this._application.emit('application:show-main-window');
      } else {
        const visibleWindows = this._application.windowManager.getVisibleWindows();
        visibleWindows.forEach((window) => window.hide());
      }
    }
  };

  updateTraySettings(iconPath: string, unreadString: string) {
    if (this._iconPath !== iconPath) {
      this._iconPath = iconPath;
      if (this._tray) this._tray.setImage(_getIcon(this._iconPath));
    }
    if (this._unreadString !== unreadString) {
      this._unreadString = unreadString;
      if (this._tray) this._tray.setToolTip(_getTooltip(unreadString));
    }
  }

  destroyTray() {
    // Due to https://github.com/electron/electron/issues/17622
    // we cannot destroy the tray icon on linux.
    if (this._tray && process.platform !== 'linux') {
      this._tray.removeListener('click', this._onClick);
      this._tray.destroy();
      this._tray = null;
    }
  }
}

export default SystemTrayManager;
