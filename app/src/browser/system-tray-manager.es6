import { Tray, Menu, nativeImage } from 'electron';

const TrayMaxStringLen = 19;
function _getMenuTemplate(platform, application, accountTemplates, conversationTemplates) {
  // the template for account list
  const templateAccount = [...accountTemplates];

  // the template for chat group list
  const templateChat = [];

  // the template for new mail and new chat group
  const templateNewMail = [
    {
      type: 'separator',
    },
    {
      label: 'Compose Email',
      click: () => application.emit('application:new-message'),
    },
  ];

  // the template for system
  const templateSystem = [
    {
      type: 'separator',
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
    templateAccount.unshift({
      label: 'All Inboxes',
      click: () => application.emit('application:show-all-inbox'),
    });
  }

  if (application.config.get(`core.workspace.enableChat`)) {
    templateChat.push(
      {
        type: 'separator',
      },
      ...conversationTemplates
    );
    templateNewMail.push({
      label: 'New Message',
      click: () => application.emit('application:new-conversation'),
    });
  }

  return [...templateAccount, ...templateChat, ...templateNewMail, ...templateSystem];
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

function _formatAccountTemplates(accounts) {
  const multiAccount = accounts.length > 1;

  const accountTemplate = accounts
    .filter(account => account.label)
    .map((account, idx) => {
      const label =
        account.label && account.label.length > TrayMaxStringLen
          ? account.label.substr(0, TrayMaxStringLen - 1) + '...'
          : account.label;
      return {
        label,
        click: () =>
          application.sendCommand(`window:select-account-${multiAccount ? idx + 1 : idx}`),
      };
    });
  return accountTemplate;
}

function _formatConversationTemplates(conversations) {
  const conversationTemplates = conversations
    .filter(conv => conv.name && conv.unreadMessages)
    .map(conv => {
      const unreadCount = conv.unreadMessages > 99 ? ' (99+)' : ` (${conv.unreadMessages})`;
      const maxLength = TrayMaxStringLen - unreadCount.length;
      const label =
        conv.name && conv.name.length > maxLength
          ? conv.name.substr(0, maxLength - 1) + '...' + unreadCount
          : conv.name + unreadCount;
      return {
        label,
        click: () => application.emit('application:select-conversation', conv.jid),
      };
    });
  return conversationTemplates;
}

class SystemTrayManager {
  constructor(platform, application) {
    this._platform = platform;
    this._application = application;
    this._iconPath = null;
    this._iconChatPath = null;
    this._unreadString = null;
    this._tray = null;
    this._accountTemplates = [];
    this._conversationTemplates = [];

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
    const accounts = this._application.config.get('accounts');
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return;
    }
    this._accountTemplates = _formatAccountTemplates(accounts);
    if (enabled && !created) {
      this._tray = new Tray(_getIcon(this._iconPath));
      this._tray.setToolTip(_getTooltip(this._unreadString));
      this._tray.addListener('click', this._onClick);
      this._tray.setContextMenu(
        Menu.buildFromTemplate(
          _getMenuTemplate(
            this._platform,
            this._application,
            this._accountTemplates,
            this._conversationTemplates
          )
        )
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
    this._application.emit('application:show-chat');
  };

  updateTraySettings(iconPath, unreadString, isTemplateImg) {
    this.initTray();
    if (this._iconPath !== iconPath) {
      this._iconPath = iconPath;
      if (this._tray) {
        this._tray.setImage(_getIcon(this._iconPath, isTemplateImg));
      }
    }
    if (this._unreadString !== unreadString) {
      this._unreadString = unreadString;
      if (this._tray) this._tray.setToolTip(_getTooltip(unreadString));
    }
  }

  updateTrayAccountMenu = () => {
    const accounts = this._application.config.get('accounts') || [];
    this._accountTemplates = _formatAccountTemplates(accounts);
    const newTemplate = _getMenuTemplate(
      this._platform,
      this._application,
      this._accountTemplates,
      this._conversationTemplates
    );
    if (this._tray) {
      this._tray.setContextMenu(Menu.buildFromTemplate(newTemplate));
    }
  };

  updateTrayConversationMenu = () => {
    const conversations = this._application.config.get('conversations');
    this._conversationTemplates = _formatConversationTemplates(conversations);
    const newTemplate = _getMenuTemplate(
      this._platform,
      this._application,
      this._accountTemplates,
      this._conversationTemplates
    );
    if (this._tray) {
      this._tray.setContextMenu(Menu.buildFromTemplate(newTemplate));
    }
  };

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
  }
}

export default SystemTrayManager;
