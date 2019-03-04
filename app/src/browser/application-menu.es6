/*
 * decaffeinate suggestions:
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const { BrowserWindow, Menu, app } = require('electron');
const Utils = require('../flux/models/utils');

// Used to manage the global application menu.
//
// It's created by {Application} upon instantiation and used to add, remove
// and maintain the state of all menu items.
module.exports = class ApplicationMenu {
  constructor(version) {
    this.version = version;
    this.windowTemplates = new WeakMap();
    this.setActiveTemplate(this.getDefaultTemplate());
    global.application.autoUpdateManager.on('state-changed', state => {
      this.updateAutoupdateMenuItem(state);
    });
  }

  // Public: Updates the entire menu with the given keybindings.
  //
  // window - The BrowserWindow this menu template is associated with.
  // template - The Object which describes the menu to display.
  // keystrokesByCommand - An Object where the keys are commands and the values
  //                       are Arrays containing the keystroke.
  update(window, template, keystrokesByCommand) {
    this.translateTemplate(template, keystrokesByCommand);
    this.windowTemplates.set(window, template);
    if (window === this.lastFocusedWindow) {
      this.setActiveTemplate(template);
    }
  }

  setActiveTemplate(template) {
    if (!Utils.isEqual(template, this.activeTemplate)) {
      this.activeTemplate = template;
      this.rebuildMenuWithActiveTemplate();
    }
  }

  rebuildMenuWithActiveTemplate() {
    const fullTemplate = Utils.deepClone(this.activeTemplate);
    this.extendTemplateWithVersion(fullTemplate);
    this.extendTemplateWithWindowMenu(fullTemplate);

    this.menu = Menu.buildFromTemplate(fullTemplate);
    Menu.setApplicationMenu(this.menu);

    this.updateAutoupdateMenuItem(global.application.autoUpdateManager.getState());
    this.updateFullscreenMenuItem(
      this.lastFocusedWindow != null && this.lastFocusedWindow.isFullScreen()
    );
    this.updateDevModeItem();
  }

  // Register a BrowserWindow with this application menu.
  addWindow(window) {
    if (!this.lastFocusedWindow) {
      this.lastFocusedWindow = window;
    }

    const focusHandler = () => {
      this.lastFocusedWindow = window;
      const template = this.windowTemplates.get(window);
      if (template) {
        this.setActiveTemplate(template);
      }
    };
    const onScreenModeChange = () => {
      this.updateFullscreenMenuItem(
        this.lastFocusedWindow != null && this.lastFocusedWindow.isFullScreen()
      );
    };

    window.on('focus', focusHandler);
    window.on('enter-full-screen', onScreenModeChange);
    window.on('leave-full-screen', onScreenModeChange);
    window.once('closed', () => {
      if (window === this.lastFocusedWindow) {
        this.lastFocusedWindow = null;
      }
      this.windowTemplates.delete(window);
      this.rebuildMenuWithActiveTemplate();
      window.removeListener('focus', focusHandler);
      window.removeListener('enter-full-screen', focusHandler);
      window.removeListener('leave-full-screen', focusHandler);
    });

    this.rebuildMenuWithActiveTemplate();
    this.enableWindowSpecificItems(true);
  }

  // Flattens the given menu and submenu items into an single Array.
  //
  // menu - A complete menu configuration object for electron's menu API.
  //
  // Returns an Array of native menu items.
  flattenMenuItems(menu) {
    let items = [];
    for (const item of menu.items || []) {
      items.push(item);
      if (item.submenu) {
        items = items.concat(this.flattenMenuItems(item.submenu));
      }
    }
    return items;
  }

  // Flattens the given menu template into an single Array.
  //
  // template - An object describing the menu item.
  //
  // Returns an Array of native menu items.
  flattenMenuTemplate(template) {
    let items = [];
    for (let item of template) {
      items.push(item);
      if (item.submenu) {
        items = items.concat(this.flattenMenuTemplate(item.submenu));
      }
    }
    return items;
  }

  // Public: Used to make all window related menu items are active.
  //
  // enable - If true enables all window specific items, if false disables all
  //          window specific items.
  enableWindowSpecificItems(enable) {
    for (let item of this.flattenMenuItems(this.menu)) {
      if (item.metadata && item.metadata['windowSpecific']) {
        item.enabled = enable;
      }
    }
  }

  // Replaces VERSION with the current version.
  extendTemplateWithVersion(template) {
    const item = this.flattenMenuTemplate(template).find(({ label }) => label === 'VERSION');
    if (item) {
      item.label = `Version ${this.version}`;
    }
  }

  extendTemplateWithWindowMenu(template) {
    const windowMenu = template.find(({ label }) => label === 'Window');
    if (!windowMenu) {
      return;
    }
    const idx = windowMenu.submenu.findIndex(({ id }) => id === 'window-list-separator');

    let workShortcut = 'CmdOrCtrl+alt+w';
    if (process.platform === 'win32') {
      workShortcut = 'ctrl+shift+w';
    }

    const accelerators = {
      default: 'CmdOrCtrl+0',
      work: workShortcut,
    };
    const windows = global.application.windowManager.getOpenWindows();
    const windowsItems = windows.map(w => ({
      label: w.loadSettings().title || 'Window',
      accelerator: accelerators[w.windowType],
      click() {
        w.show();
        w.focus();
      },
    }));
    return windowMenu.submenu.splice(idx, 0, { type: 'separator' }, ...windowsItems);
  }

  // Sets the proper visible state the update menu items
  updateAutoupdateMenuItem(state) {
    const checkForUpdateItem = this.flattenMenuItems(this.menu).find(
      ({ label }) => label === 'Check for Update'
    );
    const downloadingUpdateItem = this.flattenMenuItems(this.menu).find(
      ({ label }) => label === 'Downloading Update'
    );
    const installUpdateItem = this.flattenMenuItems(this.menu).find(
      ({ label }) => label === 'Restart and Install Update'
    );

    if (checkForUpdateItem == null || downloadingUpdateItem == null || installUpdateItem == null) {
      return;
    }

    checkForUpdateItem.visible = false;
    downloadingUpdateItem.visible = false;
    installUpdateItem.visible = false;

    switch (state) {
      case 'idle':
      case 'error':
      case 'no-update-available':
        checkForUpdateItem.visible = true;
        break;
      case 'checking':
      case 'downloading':
        downloadingUpdateItem.visible = true;
        break;
      case 'update-available':
        installUpdateItem.visible = true;
        break;
      default:
    }
  }

  updateFullscreenMenuItem(fullscreen) {
    const enterItem = this.flattenMenuItems(this.menu).find(
      ({ key }) => key === 'enterFullScreen'
    );
    const exitItem = this.flattenMenuItems(this.menu).find(
      ({ key }) => key === 'exitFullScreen'
    );
    if (!enterItem || !exitItem) {
      return;
    }
    enterItem.visible = !fullscreen;
    exitItem.visible = fullscreen;
  }

  updateDevModeItem() {
    const devModeItem = this.flattenMenuItems(this.menu).find(
      ({ command }) => command === 'application:toggle-dev'
    );
    if (devModeItem) {
      devModeItem.checked = global.application.devMode;
    }
  }

  // Default list of menu items.
  //
  // Returns an Array of menu item Objects.
  getDefaultTemplate() {
    return [
      {
        label: 'EdisonMail',
        submenu: [
          { label: 'Check for Update', metadata: { autoUpdate: true } },
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: () =>
              BrowserWindow.getFocusedWindow() && BrowserWindow.getFocusedWindow().reload(),
          },
          {
            label: 'Close Window',
            accelerator: 'CmdOrCtrl+Shift+W',
            click: () =>
              BrowserWindow.getFocusedWindow() && BrowserWindow.getFocusedWindow().close(),
          },
          {
            label: 'Toggle Dev Tools',
            accelerator: 'CmdOrCtrl+Alt+I',
            click: () =>
              BrowserWindow.getFocusedWindow() && BrowserWindow.getFocusedWindow().toggleDevTools(),
          },
          {
            label: 'Quit',
            accelerator: 'CmdOrCtrl+Q',
            click() {
              app.quit();
            },
          },
        ],
      },
    ];
  }

  // Combines a menu template with the appropriate keystroke.
  //
  // template - An Object conforming to electron's menu api but lacking
  //            accelerator and click properties.
  // keystrokesByCommand - An Object where the keys are commands and the values
  //                       are Arrays containing the keystroke.
  //
  // Returns a complete menu configuration object for electron's menu API.
  //
  translateTemplate(template, keystrokesByCommand) {
    template.forEach(item => {
      if (item.metadata == null) {
        item.metadata = {};
      }
      if (item.command) {
        item.accelerator = this.acceleratorForCommand(item.command, keystrokesByCommand);
        item.click = () => {
          global.application.sendCommand(item.command, item.args);
        };
        if (!/^application:/.test(item.command)) {
          item.metadata['windowSpecific'] = true;
        }
      }
      if (item.submenu) {
        this.translateTemplate(item.submenu, keystrokesByCommand);
      }
    });
    return template;
  }

  // Determine the accelerator for a given command.
  //
  // command - The name of the command.
  // keystrokesByCommand - An Object where the keys are commands and the values
  //                       are Arrays containing the keystroke.
  //
  // Returns a String containing the keystroke in a format that can be interpreted
  //   by Electron to provide nice icons where available.
  acceleratorForCommand(command, keystrokesByCommand) {
    let firstKeystroke = keystrokesByCommand[command] && keystrokesByCommand[command][0];
    if (!firstKeystroke) {
      return null;
    }

    if (/f\d+/.test(firstKeystroke)) {
      firstKeystroke = firstKeystroke.toUpperCase();
    }

    let modifiers = firstKeystroke.split('+');
    const key = modifiers.pop();

    modifiers = modifiers.map(modifier =>
      modifier
        .replace(/shift/gi, 'Shift')
        .replace(/command/gi, 'Command')
        .replace(/mod/gi, 'CmdOrCtrl')
        .replace(/ctrl/gi, 'Ctrl')
        .replace(/alt/gi, 'Alt')
    );

    const keys = modifiers.concat([key.toUpperCase()]);
    return keys.join('+');
  }
};
