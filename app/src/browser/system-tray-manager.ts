import path from 'path';
import { app, Tray, Menu, nativeImage, NativeImage, nativeTheme } from 'electron';
import { localized } from '../intl';
import { waitForStatusNotifierHost } from './sni-host';
import Application from './application';

// Windows remembers whether a tray icon is pinned to the taskbar or hidden in the
// overflow flyout. Without a GUID it keys that choice by the executable's path, and
// Squirrel installs every update into a new app-x.y.z folder, so the icon falls back
// into the overflow after each update. With a GUID on a signed executable, Windows
// keys the choice by the GUID and the signer instead. Never change this value: users
// would have to pin the icon again.
const WINDOWS_TRAY_GUID = 'a66c4fa1-dd67-4732-9609-776b8a41579c';

function _createTray(platform: string, icon: NativeImage) {
  // An unsigned executable ties the GUID to its path, and Windows then refuses to
  // create the icon from any other path. Dev builds run an unsigned electron.exe
  // from each checkout, so only packaged builds use the GUID. Electron rejects an
  // explicit `undefined` GUID, so the argument is omitted everywhere else.
  if (platform === 'win32' && app.isPackaged) {
    return new Tray(icon, WINDOWS_TRAY_GUID);
  }
  return new Tray(icon);
}

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

class SystemTrayManager {
  _iconPath = null;
  _unreadString = null;
  _tray = null;
  _awaitingTrayHost = false;
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

  _trayEnabled() {
    return this._application.config.get('core.workspace.systemTray') !== false;
  }

  async initTray() {
    if (!this._trayEnabled() || this._tray !== null || this._awaitingTrayHost) return;

    if (this._platform === 'linux') {
      this._awaitingTrayHost = true;
      try {
        await waitForStatusNotifierHost();
      } finally {
        this._awaitingTrayHost = false;
      }
      // The setting can be switched off while we were waiting for the host.
      if (!this._trayEnabled() || this._tray !== null) return;
    }

    this._tray = _createTray(this._platform, _getIcon(this._iconPath || this._defaultIconPath()));
    this._tray.setToolTip(_getTooltip(this._unreadString));
    this._tray.addListener('click', this._onClick);
    this._tray.setContextMenu(
      Menu.buildFromTemplate(_getMenuTemplate(this._platform, this._application) as any)
    );
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
