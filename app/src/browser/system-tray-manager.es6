import { Tray, Menu, nativeImage } from 'electron';

function _getMenuTemplate(platform, application) {
  const template = [
    {
      label: 'New Message',
      click: () => application.emit('application:new-message'),
    },
    {
      label: 'Preferences',
      click: () => application.emit('application:open-preferences'),
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit EdisonMail',
      click: () => {
        //DC-256 let tray.mouse-leave event fire before triggering app quit
        //otherwise it'll cause electron to crash
        setTimeout(() => {
          application.emit('application:quit');
        }, 200);
      },
    },
  ];

  if (platform !== 'win32') {
    template.unshift({
      label: 'Open Inbox',
      click: () => application.emit('application:show-all-inbox'),
    });
  }

  return template;
}

function _getTooltip(unreadString) {
  return unreadString ? `${unreadString} unread messages` : '';
}

function _getIcon(iconPath, isTemplateImg) {
  if (!iconPath) {
    return nativeImage.createEmpty();
  }
  const icon = nativeImage.createFromPath(iconPath);
  // if (isTemplateImg) {
  icon.setTemplateImage(true);
  // }
  return icon;
}

class SystemTrayManager {
  constructor(platform, application) {
    this._platform = platform;
    this._application = application;
    this._iconPath = null;
    this._unreadString = null;
    this._tray = null;
    this._trayChat = null;
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
      this._trayChat = new Tray(_getIcon(this._iconPath));
      this._trayChat.addListener('click', this._onChatClick);

      this._tray = new Tray(_getIcon(this._iconPath));
      this._tray.setToolTip(_getTooltip(this._unreadString));
      this._tray.addListener('click', this._onClick);
      this._tray.setContextMenu(
        Menu.buildFromTemplate(_getMenuTemplate(this._platform, this._application))
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

  _onChatClick = () => {
    this._application.emit('application:show-main-window');
  };

  updateTraySettings(iconPath, unreadString, isTemplateImg, chatIconPath) {
    if (this._iconPath !== iconPath) {
      this._iconPath = iconPath;
      if (this._tray) this._tray.setImage(_getIcon(this._iconPath, isTemplateImg));
    }
    if (this._unreadString !== unreadString) {
      this._unreadString = unreadString;
      if (this._tray) this._tray.setToolTip(_getTooltip(unreadString));
    }
    if (this._iconChatPath !== chatIconPath) {
      this._iconChatPath = chatIconPath;
      if (this._trayChat) this._trayChat.setImage(_getIcon(this._iconChatPath, isTemplateImg));
    }
  }

  updateTrayChatUnreadCount(count) {
    if (this._trayChat && count !== undefined) {
      if (count > 99) {
        count = '99+';
      } else if (count == 0) {
        count = '';
      } else {
        count = count + '';
      }
      this._trayChat.setTitle(count);
    }
  }

  destroyTray() {
    if (this._tray) {
      this._tray.removeListener('click', this._onClick);
      this._tray.destroy();
      this._tray = null;
    }
    if (this._trayChat) {
      this._trayChat.removeListener('click', this._onChatClick);
      this._trayChat.destroy();
      this._trayChat = null;
    }
  }
}

export default SystemTrayManager;
