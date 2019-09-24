/* eslint global-require: "off" */

import { BrowserWindow, Menu, app, ipcMain, dialog, nativeImage, shell } from 'electron';

import fs from 'fs-plus';
import url from 'url';
import path from 'path';
import proc from 'child_process';
import { EventEmitter } from 'events';

import { localized, initializeLocalization } from '../intl';
import WindowManager from './window-manager';
import FileListCache from './file-list-cache';
import ConfigMigrator from './config-migrator';
import ApplicationMenu from './application-menu';
import ApplicationTouchBar from './application-touch-bar';
import AutoUpdateManager from './autoupdate-manager';
import SystemTrayManager from './system-tray-manager';
import { DefaultClientHelper } from '../default-client-helper';
import MailspringProtocolHandler from './mailspring-protocol-handler';
import ConfigPersistenceManager from './config-persistence-manager';
import moveToApplications from './move-to-applications';
import { MailsyncProcess } from '../mailsync-process';
import Config from '../config';

let clipboard = null;

// The application's singleton class.
//
export default class Application extends EventEmitter {
  resourcePath: string;
  configDirPath: string;
  config: Config;
  version: string;
  devMode: boolean;
  specMode: boolean;
  safeMode: boolean;
  quitting: boolean;

  configMigrator: ConfigMigrator;
  configPersistenceManager: ConfigPersistenceManager;
  touchBar: ApplicationTouchBar;
  fileListCache: FileListCache;
  applicationMenu: ApplicationMenu;
  mailspringProtocolHandler: MailspringProtocolHandler;
  windowManager: WindowManager;
  autoUpdateManager: AutoUpdateManager;
  systemTrayManager: SystemTrayManager;

  _sourceWindows: { [taskId: string]: BrowserWindow } = {};
  _resettingAndRelaunching: boolean;

  async start(options) {
    const { resourcePath, configDirPath, version, devMode, specMode, safeMode } = options;

    initializeLocalization({ configDirPath });

    // Normalize to make sure drive letter case is consistent on Windows
    this.resourcePath = resourcePath;
    this.configDirPath = configDirPath;
    this.version = version;
    this.devMode = devMode;
    this.specMode = specMode;
    this.safeMode = safeMode;

    this.fileListCache = new FileListCache();
    this.mailspringProtocolHandler = new MailspringProtocolHandler({
      configDirPath,
      resourcePath,
      safeMode,
    });

    try {
      const mailsync = new MailsyncProcess(options);
      await mailsync.migrate();
    } catch (err) {
      let message = null;
      let buttons = [localized('Quit')];
      if (err.toString().includes('ENOENT')) {
        message = localized(
          `Mailspring could not find the mailsync process. If you're building Mailspring from source, make sure mailsync.tar.gz has been downloaded and unpacked in your working copy.`
        );
      } else if (err.toString().includes('spawn')) {
        message = localized(`Mailspring could not spawn the mailsync process. %@`, err.toString());
      } else {
        message = localized(
          `We encountered a problem with your local email database. %@\n\nCheck that no other copies of Mailspring are running and click Rebuild to reset your local cache.`,
          err.toString()
        );
        buttons = [localized('Quit'), localized('Rebuild')];
      }

      const buttonIndex = dialog.showMessageBox({ type: 'warning', buttons, message });

      if (buttonIndex === 0) {
        app.quit();
      } else {
        this._deleteDatabase(() => {
          app.relaunch();
          app.quit();
        });
      }
      return;
    }

    const Config = require('../config').default;
    const config = new Config();
    this.config = config;
    this.configPersistenceManager = new ConfigPersistenceManager({ configDirPath, resourcePath });
    config.load();

    this.configMigrator = new ConfigMigrator(this.config);
    this.configMigrator.migrate();

    let initializeInBackground = options.background;
    if (initializeInBackground === undefined) {
      initializeInBackground = false;
    }

    await this.oneTimeMoveToApplications();
    await this.oneTimeAddToDock();

    this.autoUpdateManager = new AutoUpdateManager(version, config, specMode);
    this.applicationMenu = new ApplicationMenu(version);
    this.windowManager = new WindowManager({
      resourcePath: this.resourcePath,
      configDirPath: this.configDirPath,
      config: this.config,
      devMode: this.devMode,
      specMode: this.specMode,
      safeMode: this.safeMode,
      initializeInBackground: initializeInBackground,
    });
    this.systemTrayManager = new SystemTrayManager(process.platform, this);
    if (process.platform === 'darwin') {
      this.touchBar = new ApplicationTouchBar(resourcePath);
    }

    this.setupJavaScriptArguments();
    this.handleEvents();
    this.handleLaunchOptions(options);

    if (process.platform === 'linux') {
      const helper = new DefaultClientHelper();
      helper.registerForURLScheme('mailspring');
    } else {
      app.setAsDefaultProtocolClient('mailspring');
    }
  }

  getMainWindow() {
    const win = this.windowManager.get(WindowManager.MAIN_WINDOW);
    return win ? win.browserWindow : null;
  }

  getAllWindowDimensions() {
    return this.windowManager.getAllWindowDimensions();
  }

  isQuitting() {
    return this.quitting;
  }

  // Opens a new window based on the options provided.
  handleLaunchOptions(options) {
    const { specMode, pathsToOpen, urlsToOpen } = options;

    if (specMode) {
      const {
        resourcePath,
        specDirectory,
        specFilePattern,
        logFile,
        showSpecsInWindow,
        jUnitXmlPath,
      } = options;
      const exitWhenDone = true;
      this.runSpecs({
        exitWhenDone,
        showSpecsInWindow,
        resourcePath,
        specDirectory,
        specFilePattern,
        logFile,
        jUnitXmlPath,
      });
      return;
    }

    this.openWindowsForTokenState();

    if (pathsToOpen instanceof Array && pathsToOpen.length > 0) {
      this.openComposerWithFiles(pathsToOpen);
    }
    if (urlsToOpen instanceof Array) {
      for (const urlToOpen of urlsToOpen) {
        this.openUrl(urlToOpen);
      }
    }
  }

  async oneTimeMoveToApplications() {
    if (process.platform !== 'darwin') {
      return;
    }
    if (this.devMode || this.specMode) {
      return;
    }
    if (this.config.get('askedAboutAppMove')) {
      return;
    }
    this.config.set('askedAboutAppMove', true);
    moveToApplications();
  }

  async oneTimeAddToDock() {
    if (process.platform !== 'darwin') {
      return;
    }
    const addedToDock = this.config.get('addedToDock');
    const appPath = process.argv[0];
    if (!addedToDock && appPath.includes('/Applications/') && appPath.includes('.app/')) {
      const appBundlePath = appPath.split('.app/')[0];
      proc.exec(
        `defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-type</key><string>file-tile</string><key>tile-data</key><dict><key>file-type</key><integer>41</integer><key>file-label</key><string>Mailspring</string><key>bundle-identifier</key><string>com.mailspring.mailspring</string><key>file-data</key><dict><key>_CFURLString</key><string>file://${appBundlePath}.app/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>" && pkill "Dock"`
      );
      this.config.set('addedToDock', true);
    }
  }

  // On Windows, removing a file can fail if a process still has it open. When
  // we close windows and log out, we need to wait for these processes to completely
  // exit and then delete the file. It's hard to tell when this happens, so we just
  // retry the deletion a few times.
  deleteFileWithRetry(filePath, callback = () => {}, retries = 5) {
    const callbackWithRetry = err => {
      if (err && err.message.indexOf('no such file') === -1) {
        console.log(`File Error: ${err.message} - retrying in 150msec`);
        setTimeout(() => {
          this.deleteFileWithRetry(filePath, callback, retries - 1);
        }, 150);
      } else {
        callback();
      }
    };

    if (!fs.existsSync(filePath)) {
      callback();
      return;
    }

    if (retries > 0) {
      fs.unlink(filePath, callbackWithRetry);
    } else {
      fs.unlink(filePath, callback);
    }
  }

  // Configures required javascript environment flags.
  setupJavaScriptArguments() {
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
    app.commandLine.appendSwitch('js-flags', '--harmony');
  }

  openWindowsForTokenState() {
    // user may trigger this using the application menu / by focusing the app
    // before migration has completed and the config has been loaded.
    if (!this.config || !this.windowManager) return;

    const accounts = this.config.get('accounts');
    const hasAccount = accounts && accounts.length > 0;
    const hasIdentity = this.config.get('identity.id');

    if (hasAccount && hasIdentity) {
      this.windowManager.ensureWindow(WindowManager.MAIN_WINDOW);
    } else {
      this.windowManager.ensureWindow(WindowManager.ONBOARDING_WINDOW, {
        title: localized('Welcome to Mailspring'),
      });
    }
  }

  _resetDatabaseAndRelaunch = ({ errorMessage }: { errorMessage?: string } = {}) => {
    if (this._resettingAndRelaunching) return;
    this._resettingAndRelaunching = true;

    if (errorMessage) {
      dialog.showMessageBox({
        type: 'warning',
        buttons: [localized('Okay')],
        message: localized(
          `We encountered a problem with your local email database. We will now attempt to rebuild it.`
        ),
        detail: errorMessage,
      });
    }

    const done = () => {
      app.relaunch();
      app.quit();
    };
    this.windowManager.destroyAllWindows();
    this._deleteDatabase(done);
  };

  _deleteDatabase = callback => {
    this.deleteFileWithRetry(path.join(this.configDirPath, 'edgehill.db'), callback);
    this.deleteFileWithRetry(path.join(this.configDirPath, 'edgehill.db-wal'));
    this.deleteFileWithRetry(path.join(this.configDirPath, 'edgehill.db-shm'));
  };

  // Registers basic application commands, non-idempotent.
  // Note: If these events are triggered while an application window is open, the window
  // needs to manually bubble them up to the Application instance via IPC or they won't be
  // handled. This happens in workspace-element.ts
  handleEvents() {
    this.on('application:run-all-specs', () => {
      const win = this.windowManager.focusedWindow();
      this.runSpecs({
        exitWhenDone: false,
        showSpecsInWindow: true,
        resourcePath: this.resourcePath,
        safeMode: win && win.safeMode,
      });
    });

    this.on('application:run-package-specs', () => {
      dialog.showOpenDialog(
        {
          title: localized('Choose Directory'),
          defaultPath: this.configDirPath,
          buttonLabel: localized('Choose'),
          properties: ['openDirectory'],
        },
        filenames => {
          if (!filenames || filenames.length === 0) {
            return;
          }
          this.runSpecs({
            exitWhenDone: false,
            showSpecsInWindow: true,
            resourcePath: this.resourcePath,
            specDirectory: filenames[0],
          });
        }
      );
    });

    this.on('application:reset-database', this._resetDatabaseAndRelaunch);

    this.on('application:quit', () => {
      app.quit();
    });

    this.on('application:inspect', ({ x, y, MailspringWindow }) => {
      const win = MailspringWindow || this.windowManager.focusedWindow();
      if (!win) {
        return;
      }
      win.browserWindow.inspectElement(x, y);
    });

    this.on('application:add-account', ({ existingAccountJSON } = {}) => {
      const onboarding = this.windowManager.get(WindowManager.ONBOARDING_WINDOW);
      if (onboarding) {
        onboarding.show();
        onboarding.focus();
      } else {
        this.windowManager.ensureWindow(WindowManager.ONBOARDING_WINDOW, {
          windowProps: { addingAccount: true, existingAccountJSON },
          title: localized('Add Account'),
        });
      }
    });

    this.on('application:new-message', () => {
      const main = this.windowManager.get(WindowManager.MAIN_WINDOW);
      if (main) {
        main.sendMessage('new-message');
      }
    });

    this.on('application:show-calendar', () => {
      this.windowManager.ensureWindow(WindowManager.CALENDAR_WINDOW, {});
      const main = this.windowManager.get(WindowManager.MAIN_WINDOW);
      if (main) {
        main.sendMessage('run-calendar-sync');
      }
    });

    this.on('application:show-contacts', () => {
      this.windowManager.ensureWindow(WindowManager.CONTACTS_WINDOW, {});
      const main = this.windowManager.get(WindowManager.MAIN_WINDOW);
      if (main) {
        main.sendMessage('run-contact-sync');
      }
    });

    this.on('application:view-help', () => {
      const helpUrl = 'http://support.getmailspring.com/hc/en-us';
      shell.openExternal(helpUrl);
    });

    this.on('application:view-getting-started', () => {
      const helpUrl =
        'https://foundry376.zendesk.com/hc/en-us/sections/115000521592-Getting-Started';
      shell.openExternal(helpUrl);
    });

    this.on('application:view-faq', () => {
      const helpUrl =
        'https://foundry376.zendesk.com/hc/en-us/sections/115000521892-Frequently-Asked-Questions';
      shell.openExternal(helpUrl);
    });

    this.on('application:open-preferences', () => {
      const main = this.windowManager.get(WindowManager.MAIN_WINDOW);
      if (main) {
        main.sendMessage('open-preferences');
      }
    });

    this.on('application:show-main-window', () => {
      this.openWindowsForTokenState();
    });

    this.on('application:check-for-update', () => {
      this.autoUpdateManager.check();
    });

    this.on('application:install-update', () => {
      this.quitting = true;
      this.windowManager.cleanupBeforeAppQuit();
      this.autoUpdateManager.install();
    });

    this.on('application:toggle-dev', () => {
      let args = process.argv.slice(1);
      if (args.includes('--dev')) {
        args = args.filter(a => a !== '--dev');
      } else {
        args.push('--dev');
      }
      app.relaunch({ args });
      app.quit();
    });

    this.on('application:view-license', () => {
      shell.openExternal(`file://${path.join(this.resourcePath, 'static', 'ALL_LICENSES.html')}`);
    });

    if (process.platform === 'darwin') {
      this.on('application:about', () => {
        Menu.sendActionToFirstResponder('orderFrontStandardAboutPanel:');
      });
      this.on('application:bring-all-windows-to-front', () => {
        Menu.sendActionToFirstResponder('arrangeInFront:');
      });
      this.on('application:hide', () => {
        Menu.sendActionToFirstResponder('hide:');
      });
      this.on('application:hide-other-applications', () => {
        Menu.sendActionToFirstResponder('hideOtherApplications:');
      });
      this.on('application:minimize', () => {
        Menu.sendActionToFirstResponder('performMiniaturize:');
      });
      this.on('application:unhide-all-applications', () => {
        Menu.sendActionToFirstResponder('unhideAllApplications:');
      });
      this.on('application:zoom', () => {
        Menu.sendActionToFirstResponder('zoom:');
      });
    } else {
      this.on('application:minimize', () => {
        const win = this.windowManager.focusedWindow();
        if (win) {
          win.minimize();
        }
      });
      this.on('application:zoom', () => {
        const win = this.windowManager.focusedWindow();
        if (win) {
          win.maximize();
        }
      });
    }

    app.on('window-all-closed', () => {
      this.windowManager.quitWinLinuxIfNoWindows();
    });

    // Called before the app tries to close any windows.
    app.on('before-quit', () => {
      // Allow the main window to be closed.
      this.quitting = true;
      // Destroy hot windows so that they can't block the app from quitting.
      // (Electron will wait for them to finish loading before quitting.)
      this.windowManager.cleanupBeforeAppQuit();
      this.systemTrayManager.destroyTray();
    });

    let pathsToOpen = [];
    let pathsTimeout = null;
    app.on('open-file', (event, pathToOpen) => {
      event.preventDefault();

      // if the user drags many files onto the app, this method is called
      // back-to-back several times. collect all the files and then fire.
      pathsToOpen.push(pathToOpen);
      clearTimeout(pathsTimeout);
      pathsTimeout = setTimeout(() => {
        this.openComposerWithFiles(pathsToOpen);
        pathsToOpen = [];
      }, 250);
    });

    app.on('open-url', (event, urlToOpen) => {
      this.openUrl(urlToOpen);
      event.preventDefault();
    });

    // System Tray
    ipcMain.on('update-system-tray', (event, iconPath, unreadString, isTemplateImg) => {
      this.systemTrayManager.updateTraySettings(iconPath, unreadString, isTemplateImg);
    });

    ipcMain.on('set-badge-value', (event, value) => {
      if (app.dock && app.dock.setBadge) {
        app.dock.setBadge(value);
      } else if (app.setBadgeCount) {
        app.setBadgeCount(value.length ? value.replace('+', '') / 1 : 0);
      }
    });

    ipcMain.on('new-window', (event, options) => {
      const win = options.windowKey ? this.windowManager.get(options.windowKey) : null;
      if (win) {
        win.show();
        win.focus();
      } else {
        this.windowManager.newWindow(options);
      }
    });

    // Theme Error Handling

    let userResetTheme = false;

    ipcMain.on('encountered-theme-error', (event, { message, detail }) => {
      if (userResetTheme) return;

      const buttonIndex = dialog.showMessageBox({
        type: 'warning',
        buttons: [localized('Reset Theme'), localized('Continue')],
        defaultId: 0,
        message,
        detail,
      });
      if (buttonIndex === 0) {
        userResetTheme = true;
        this.config.set('core.theme', '');
      }
    });

    ipcMain.on('inline-style-parse', (event, { html, key }) => {
      const juice = require('juice');
      let out = null;
      try {
        out = juice(html);
      } catch (e) {
        // If the juicer fails (because of malformed CSS or some other
        // reason), then just return the body. We will still push it
        // through the HTML sanitizer which will strip the style tags. Oh
        // well.
        out = html;
      }
      // win = BrowserWindow.fromWebContents(event.sender)
      event.sender.send('inline-styles-result', { html: out, key });
    });

    app.on('activate', (event, hasVisibleWindows) => {
      if (!hasVisibleWindows) {
        this.openWindowsForTokenState();
      }
      event.preventDefault();
    });

    ipcMain.on('update-application-menu', (event, template, keystrokesByCommand) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      this.applicationMenu.update(win, template, keystrokesByCommand);
      if (win === this.getMainWindow() && process.platform === 'darwin') {
        this.touchBar.update(template);
      }
    });

    ipcMain.on('command', (event, command, ...args) => {
      this.emit(command, ...args);
    });

    ipcMain.on('window-command', (event, command, ...args) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      win.emit(command, ...args);
    });

    ipcMain.on('call-window-method', (event, method, ...args) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win[method]) {
        console.error(`Method ${method} does not exist on BrowserWindow!`);
      }
      win[method](...args);
    });

    ipcMain.on('call-devtools-webcontents-method', (event, method, ...args) => {
      // If devtools aren't open the `webContents::devToolsWebContents` will be null
      if (event.sender.devToolsWebContents) {
        event.sender.devToolsWebContents[method](...args);
      }
    });

    ipcMain.on('call-webcontents-method', (event, method, ...args) => {
      if (!event.sender[method]) {
        console.error(`Method ${method} does not exist on WebContents!`);
      }
      event.sender[method](...args);
    });

    ipcMain.on('mailsync-bridge-rebroadcast-to-all', (event, ...args) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      this.windowManager.sendToAllWindows('mailsync-bridge-message', { except: win }, ...args);
    });

    ipcMain.on('action-bridge-rebroadcast-to-all', (event, ...args) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      this.windowManager.sendToAllWindows('action-bridge-message', { except: win }, ...args);
    });

    ipcMain.on('action-bridge-rebroadcast-to-default', (event, ...args) => {
      const mainWindow = this.windowManager.get(WindowManager.MAIN_WINDOW);
      if (!mainWindow || !mainWindow.browserWindow.webContents) {
        return;
      }
      if (BrowserWindow.fromWebContents(event.sender) === mainWindow.browserWindow) {
        return;
      }
      mainWindow.browserWindow.webContents.send('action-bridge-message', ...args);
    });

    ipcMain.on('write-image-to-clipboard', (event, dataURL) => {
      // This can't be done from the renderer due to https://github.com/electron/electron/issues/8151
      clipboard = require('electron').clipboard;
      clipboard.writeImage(nativeImage.createFromDataURL(dataURL));
    });

    ipcMain.on('write-text-to-selection-clipboard', (event, selectedText) => {
      clipboard = require('electron').clipboard;
      clipboard.writeText(selectedText, 'selection');
    });

    ipcMain.on('account-setup-successful', () => {
      this.windowManager.ensureWindow(WindowManager.MAIN_WINDOW);
      const onboarding = this.windowManager.get(WindowManager.ONBOARDING_WINDOW);
      if (onboarding) {
        onboarding.close();
      }
    });

    ipcMain.on('run-in-window', (event, params) => {
      const sourceWindow = BrowserWindow.fromWebContents(event.sender);
      this._sourceWindows[params.taskId] = sourceWindow;

      const targetWindowKey = {
        main: WindowManager.MAIN_WINDOW,
      }[params.window];
      if (!targetWindowKey) {
        throw new Error("We don't support running in that window");
      }

      const targetWindow = this.windowManager.get(targetWindowKey);
      if (!targetWindow || !targetWindow.browserWindow.webContents) {
        return;
      }
      targetWindow.browserWindow.webContents.send('run-in-window', params);
    });

    ipcMain.on('remote-run-results', (event, params) => {
      const sourceWindow = this._sourceWindows[params.taskId];
      sourceWindow.webContents.send('remote-run-results', params);
      delete this._sourceWindows[params.taskId];
    });

    ipcMain.on('report-error', (event, params: { extra?: string; errorJSON?: string } = {}) => {
      try {
        const errorParams = JSON.parse(params.errorJSON || '{}');
        const extra = JSON.parse(params.extra || '{}');
        let err = new Error();
        err = Object.assign(err, errorParams);
        global.errorLogger.reportError(err, extra);
      } catch (parseError) {
        console.error(parseError);
        global.errorLogger.reportError(parseError, {});
      }
      event.returnValue = true;
    });
  }

  // Public: Executes the given command.
  //
  // If it isn't handled globally, delegate to the currently focused window.
  // If there is no focused window (all the windows of the app are hidden),
  // fire the command to the main window. (This ensures that `application:`
  // commands, like Cmd-N work when no windows are visible.)
  //
  // command - The string representing the command.
  // args - The optional arguments to pass along.
  sendCommand(command, ...args) {
    if (this.emit(command, ...args)) {
      return;
    }
    const focusedWindow = this.windowManager.focusedWindow();
    if (focusedWindow) {
      focusedWindow.sendCommand(command, ...args);
    } else {
      if (this.sendCommandToFirstResponder(command)) {
        return;
      }

      const focusedBrowserWindow = BrowserWindow.getFocusedWindow();
      const mainWindow = this.windowManager.get(WindowManager.MAIN_WINDOW);
      if (focusedBrowserWindow) {
        switch (command) {
          case 'window:reload':
            focusedBrowserWindow.reload();
            break;
          case 'window:toggle-dev-tools':
            focusedBrowserWindow.webContents.toggleDevTools();
            break;
          case 'window:close':
            focusedBrowserWindow.close();
            break;
          default:
            break;
        }
      } else if (mainWindow) {
        mainWindow.sendCommand(command, ...args);
      }
    }
  }

  // Public: Executes the given command on the given window.
  //
  // command - The string representing the command.
  // MailspringWindow - The {MailspringWindow} to send the command to.
  // args - The optional arguments to pass along.
  sendCommandToWindow = (command, MailspringWindow, ...args) => {
    console.log('sendCommandToWindow');
    console.log(command);
    if (this.emit(command, ...args)) {
      return;
    }
    if (MailspringWindow) {
      MailspringWindow.sendCommand(command, ...args);
    } else {
      this.sendCommandToFirstResponder(command);
    }
  };

  // Translates the command into OS X action and sends it to application's first
  // responder.
  sendCommandToFirstResponder = command => {
    if (process.platform !== 'darwin') {
      return false;
    }

    const commandsToActions = {
      'core:undo': 'undo:',
      'core:redo': 'redo:',
      'core:copy': 'copy:',
      'core:cut': 'cut:',
      'core:paste': 'paste:',
      'core:select-all': 'selectAll:',
    };

    if (commandsToActions[command]) {
      Menu.sendActionToFirstResponder(commandsToActions[command]);
      return true;
    }
    return false;
  };

  // Open a mailto:// url.
  //
  openUrl(urlToOpen) {
    const parts = url.parse(urlToOpen);
    const main = this.windowManager.get(WindowManager.MAIN_WINDOW);

    if (!main) {
      console.log(`Ignoring URL - main window is not available, user may not be authed.`);
      return;
    }

    if (parts.protocol === 'mailto:') {
      main.sendMessage('mailto', urlToOpen);
    } else if (parts.protocol === 'mailspring:') {
      if (parts.host === 'plugins') {
        main.sendMessage('changePluginStateFromUrl', urlToOpen);
      } else {
        main.sendMessage('openThreadFromWeb', urlToOpen);
      }
    } else {
      console.log(`Ignoring unknown URL type: ${urlToOpen}`);
    }
  }

  openComposerWithFiles(pathsToOpen) {
    const main = this.windowManager.get(WindowManager.MAIN_WINDOW);
    if (main) {
      main.sendMessage('mailfiles', pathsToOpen);
    }
  }

  // Opens up a new {MailspringWindow} to run specs within.
  //
  // options -
  //   :exitWhenDone - A Boolean that, if true, will close the window upon
  //                   completion and exit the app with the status code of
  //                   1 if the specs failed and 0 if they passed.
  //   :showSpecsInWindow - A Boolean that, if true, will run specs in a
  //                        window
  //   :resourcePath - The path to include specs from.
  //   :specPath - The directory to load specs from.
  //   :safeMode - A Boolean that, if true, won't run specs from <config-dir>/packages
  //               and <config-dir>/dev/packages, defaults to false.
  //   :jUnitXmlPath - The path to output jUnit XML reports to, if desired.
  runSpecs(specWindowOptionsArg) {
    const specWindowOptions = specWindowOptionsArg;
    let { resourcePath } = specWindowOptions;
    if (resourcePath !== this.resourcePath && !fs.existsSync(resourcePath)) {
      resourcePath = this.resourcePath;
    }

    let bootstrapScript = null;
    try {
      bootstrapScript = require.resolve(
        path.resolve(this.resourcePath, 'spec', 'spec-runner', 'spec-bootstrap')
      );
    } catch (error) {
      bootstrapScript = require.resolve(
        path.resolve(__dirname, '..', '..', 'spec', 'spec-runner', 'spec-bootstrap')
      );
    }

    // Important: Use .mailspring-spec instead of .mailspring-mail to avoid overwriting the
    // user's real email config!
    const configDirPath = path.join(app.getPath('home'), '.mailspring-spec');

    specWindowOptions.resourcePath = resourcePath;
    specWindowOptions.configDirPath = configDirPath;
    specWindowOptions.bootstrapScript = bootstrapScript;

    this.windowManager.ensureWindow(WindowManager.SPEC_WINDOW, specWindowOptions);
  }
}
