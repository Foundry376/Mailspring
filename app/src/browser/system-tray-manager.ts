import { Tray, Menu, nativeImage } from 'electron';
import { localized } from '../intl';
import Application from './application';

function _getMenuTemplate(platform, application) {
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

function _getTooltip(unreadString) {
  return unreadString ? `${unreadString} unread messages` : '';
}

function _getIcon(iconPath, isTemplateImg = false) {
  if (!iconPath) {
    return nativeImage.createEmpty();
  }
  const icon = nativeImage.createFromPath(iconPath);
  if (isTemplateImg) {
    icon.setTemplateImage(true);
  }
  return icon;
}

class SystemTrayManager {
  _iconPath = null;
  _unreadString = null;
  _tray = null;
  _platform: string = null;
  _application: Application;

  constructor(platform, application) {
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

  initTray() {
    const enabled = this._application.config.get('core.workspace.systemTray') !== false;
    const created = this._tray !== null;

    if (enabled && !created) {
      this._tray = new Tray(_getIcon(this._iconPath));
      this._tray.setToolTip(_getTooltip(this._unreadString));
      this._tray.addListener('click', this._onClick);
      this._tray.setContextMenu(
        Menu.buildFromTemplate(_getMenuTemplate(this._platform, this._application) as any)
      );
    }
  }

  _onClick = () => {
    if (this._platform !== 'darwin') {
      if (this._application.windowManager.getVisibleWindowCount() === 0) {
        this._application.emit('application:show-main-window');
      } else {
        const visibleWindows = this._application.windowManager.getVisibleWindows();
        visibleWindows.forEach(window => window.hide());
      }
    }
  };

  updateTraySettings(iconPath, unreadString, isTemplateImg) {
    if (this._iconPath !== iconPath) {
      this._iconPath = iconPath;
      if (this._tray) this._tray.setImage(_getIcon(this._iconPath, isTemplateImg));
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
