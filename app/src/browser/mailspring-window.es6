const { BrowserWindow, app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { EventEmitter } = require('events');

let WindowIconPath = null;
let idNum = 0;

module.exports = class MailspringWindow extends EventEmitter {
  static includeShellLoadTime = true;

  constructor(settings = {}) {
    super();

    let frame, height, pathToOpen, resizable, title, width, autoHideMenuBar;
    this.browserWindow = null;
    this.loaded = null;
    this.isSpec = null;

    ({
      frame,
      title,
      width,
      height,
      // toolbar, present but passed through to client-side
      resizable,
      pathToOpen,
      isSpec: this.isSpec,
      devMode: this.devMode,
      windowKey: this.windowKey,
      safeMode: this.safeMode,
      neverClose: this.neverClose,
      mainWindow: this.mainWindow,
      windowType: this.windowType,
      resourcePath: this.resourcePath,
      exitWhenDone: this.exitWhenDone,
      configDirPath: this.configDirPath,
      autoHideMenuBar,
    } = settings);

    if (!this.windowKey) {
      this.windowKey = `${this.windowType}-${idNum}`;
      idNum += 1;
    }

    // Normalize to make sure drive letter case is consistent on Windows
    if (this.resourcePath) {
      this.resourcePath = path.normalize(this.resourcePath);
    }

    const browserWindowOptions = {
      show: false,
      title: title || 'EdisonMail',
      frame,
      width,
      height,
      resizable,
      acceptFirstMouse: true,
      webPreferences: {
        directWrite: true,
        nodeIntegration: true,
        webviewTag: true
      },
      autoHideMenuBar,
      backgroundColor: settings.backgroundColor || '#ffffff',
    };

    if (this.neverClose) {
      // Prevents DOM timers from being suspended when the main window is hidden.
      // Means there's not an awkward catch-up when you re-show the main window.
      // TODO
      // This option is no longer working according to
      // https://github.com/atom/electron/issues/3225
      // Look into using option --disable-renderer-backgrounding
      browserWindowOptions.webPreferences.pageVisibility = true;
    }

    // Don't set icon on Windows so the exe's ico will be used as window and
    // taskbar's icon. See https://github.com/atom/atom/issues/4811 for more.
    if (process.platform === 'linux') {
      if (!WindowIconPath) {
        WindowIconPath = path.resolve(__dirname, '..', '..', 'edisonmail.png');
        if (!fs.existsSync(WindowIconPath)) {
          WindowIconPath = path.resolve(
            __dirname,
            '..',
            '..',
            'build',
            'resources',
            'edisonmail.png'
          );
        }
      }
      browserWindowOptions.icon = WindowIconPath;
    }

    this.browserWindow = new BrowserWindow(browserWindowOptions);
    this.browserWindow.updateLoadSettings = this.updateLoadSettings;
    if (this.browserWindow.center) {
      this.browserWindow.center();
    }

    this.handleEvents();

    const loadSettings = Object.assign({}, settings);
    loadSettings.appVersion = global.application.version;
    loadSettings.resourcePath = this.resourcePath;
    if (loadSettings.devMode == null) {
      loadSettings.devMode = false;
    }
    if (loadSettings.safeMode == null) {
      loadSettings.safeMode = false;
    }
    if (loadSettings.mainWindow == null) {
      loadSettings.mainWindow = this.mainWindow;
    }
    if (loadSettings.windowType == null) {
      loadSettings.windowType = 'default';
    }

    // Only send to the first non-spec window created
    if (this.constructor.includeShellLoadTime && !this.isSpec) {
      this.constructor.includeShellLoadTime = false;
      if (loadSettings.shellLoadTime == null) {
        loadSettings.shellLoadTime = Date.now() - global.shellStartTime;
      }
    }

    loadSettings.initialPath = pathToOpen;

    const stats = fs.statSyncNoException(pathToOpen);
    if (stats && stats.isFile && stats.isFile()) {
      loadSettings.initialPath = path.dirname(pathToOpen);
    }

    this.browserWindow.loadSettings = loadSettings;

    this.browserWindow.once('window:loaded', () => {
      this.loaded = true;
      if (this.browserWindow.loadSettingsChangedSinceGetURL) {
        this.browserWindow.webContents.send(
          'load-settings-changed',
          this.browserWindow.loadSettings
        );
      }
      this.emit('window:loaded');
    });

    this.browserWindow.loadURL(this.getURL(loadSettings));
    if (this.isSpec) {
      this.browserWindow.focusOnWebView();
    }
  }
  updateWindowKey(key) {
    this.windowKey = key;
  }

  updateLoadSettings = (newSettings = {}) => {
    this.loaded = true;
    this.setLoadSettings(Object.assign({}, this.browserWindow.loadSettings, newSettings));
  };

  loadSettings() {
    return this.browserWindow.loadSettings;
  }

  // This gets called when we want to turn a WindowLauncher.EMPTY_WINDOW
  // into a new kind of custom popout window.
  //
  // The windowType will change which will cause a new set of plugins to
  // load.
  setLoadSettings(loadSettings) {
    this.browserWindow.loadSettings = loadSettings;
    this.browserWindow.loadSettingsChangedSinceGetURL = true;
    this.browserWindow.webContents.send('load-settings-changed', loadSettings);
  }

  getURL(loadSettings) {
    this.browserWindow.loadSettingsChangedSinceGetURL = false;

    return url.format({
      protocol: 'file',
      pathname: `${this.resourcePath}/static/index.html`,
      slashes: true,
      query: { loadSettings: JSON.stringify(loadSettings) },
    });
  }

  handleEvents() {
    // Also see logic in `AppEnv::onBeforeUnload` and
    // `WindowEventHandler::AddUnloadCallback`. Classes like the DraftStore
    // and ActionBridge intercept the closing of windows and perform
    // action.
    //
    // This uses the DOM's `beforeunload` event.
    this.browserWindow.on('close', event => {
      if (this.neverClose && !global.application.isQuitting()) {
        // For neverClose windows (like the main window) simply hide and
        // take out of full screen.
        event.preventDefault();
        if (this.browserWindow.isFullScreen()) {
          this.browserWindow.once('leave-full-screen', () => {
            this.browserWindow.hide();
          });
          this.browserWindow.setFullScreen(false);
        } else {
          this.browserWindow.hide();
        }

        // HOWEVER! If the neverClose window is the last window open, and
        // it looks like there's no windows actually quit the application
        // on Linux & Windows.
        if (!this.isSpec) {
          global.application.windowManager.quitWinLinuxIfNoWindows();
        }
      }
    });

    this.browserWindow.on('scroll-touch-begin', () => {
      this.browserWindow.webContents.send('scroll-touch-begin');
    });

    this.browserWindow.on('scroll-touch-end', () => {
      this.browserWindow.webContents.send('scroll-touch-end');
    });

    this.browserWindow.on('focus', () => {
      this.browserWindow.webContents.send('browser-window-focus');
    });

    this.browserWindow.on('blur', () => {
      this.browserWindow.webContents.send('browser-window-blur');
    });

    this.browserWindow.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
    });

    this.browserWindow.webContents.on('new-window', (event, url, frameName, disposition) => {
      event.preventDefault();
    });

    this.browserWindow.on('unresponsive', () => {
      if (this.isSpec) {
        return;
      }
      if (!this.loaded) {
        return;
      }

      const chosen = dialog.showMessageBox(this.browserWindow, {
        type: 'warning',
        buttons: ['Close', 'Keep Waiting'],
        message: 'EdisonMail is not responding',
        detail: 'Would you like to force close it or keep waiting?',
      });
      if (chosen === 0) {
        this.browserWindow.destroy();
      }
      console.log('\n----\nunresponsive\n\n');
      // global.application.reportError(new Error(`unresponsive for window ${this.windowKey}`), {errorData: this.browserWindow ? this.browserWindow.loadSettings : 'browserWindow not available'}, {grabLogs: true});
      console.log('\n----\nunresponsive\n\n');
    });

    this.browserWindow.webContents.on('crashed', (event, killed) => {
      if (killed) {
        // Killed means that the app is exiting and the browser window is being
        // forceably cleaned up. Carry on, do not try to reload the window.
        this.browserWindow.destroy();
        return;
      }

      if (this.exitWhenDone) {
        app.exit(100);
      }
      // global.application.reportError(
      //   new Error(`crashed for window ${this.windowKey}`),
      //   {
      //     errorData: this.browserWindow
      //       ? this.browserWindow.loadSettings
      //       : 'browserWindow not available',
      //   },
      //   { grabLogs: true }
      // );
      if (this.neverClose) {
        this.browserWindow.reload();
      } else {
        const chosen = dialog.showMessageBox(this.browserWindow, {
          type: 'warning',
          buttons: ['Close Window', 'Reload', 'Keep It Open'],
          message: 'EdisonMail has crashed',
          detail: 'Please report this issue to us at support@edison.tech.',
        });
        if (chosen === 0) {
          this.browserWindow.destroy();
        } else if (chosen === 1) {
          this.browserWindow.reload();
        }
      }
    });

    if (this.isSpec) {
      // Workaround for https://github.com/atom/electron/issues/380
      // Don't focus the window when it is being blurred during close or
      // else the app will crash on Windows.
      if (process.platform === 'win32') {
        this.browserWindow.on('close', () => {
          this.isWindowClosing = true;
        });
      }

      // Spec window's web view should always have focus
      this.browserWindow.on('blur', () => {
        if (!this.isWindowClosing) {
          this.browserWindow.focusOnWebView();
        }
      });
    }
  }

  sendMessage(message, detail) {
    this.waitForLoad(() => this.browserWindow.webContents.send(message, detail));
  }

  sendCommand(command, ...args) {
    if (this.isSpecWindow()) {
      if (!global.application.sendCommandToFirstResponder(command)) {
        switch (command) {
          case 'window:reload':
            return this.reload();
          case 'window:toggle-dev-tools':
            return this.toggleDevTools();
          case 'window:close':
            return this.close();
          default:
        }
      }
    } else if (this.isWebViewFocused()) {
      return this.sendCommandToBrowserWindow(command, ...args);
    } else {
      if (!global.application.sendCommandToFirstResponder(command)) {
        return this.sendCommandToBrowserWindow(command, ...args);
      }
    }
  }

  sendCommandToBrowserWindow(command, ...args) {
    this.browserWindow.webContents.send('command', command, ...args);
  }

  getDimensions() {
    const [x, y] = this.browserWindow.getPosition();
    const [width, height] = this.browserWindow.getSize();
    return { x, y, width, height };
  }

  close() {
    if (!this.browserWindow.isDestroyed()) {
      this.browserWindow.close();
    }
  }

  hide() {
    if (!this.browserWindow.isDestroyed()) {
      this.browserWindow.hide();
    }
  }

  show() {
    if (!this.browserWindow.isDestroyed()) {
      this.browserWindow.show();
    }
  }

  showWhenLoaded() {
    this.waitForLoad(() => {
      this.show();
      this.focus();
    });
  }

  waitForLoad(fn) {
    if (this.loaded) {
      fn();
    } else {
      this.once('window:loaded', fn);
    }
  }

  focus() {
    this.browserWindow.focus();
  }

  minimize() {
    this.browserWindow.minimize();
  }

  maximize() {
    this.browserWindow.maximize();
  }

  restore() {
    this.browserWindow.restore();
  }

  isFocused() {
    return this.browserWindow.isFocused();
  }

  isMinimized() {
    return this.browserWindow.isMinimized();
  }

  isVisible() {
    return this.browserWindow.isVisible();
  }

  isLoaded() {
    return this.loaded;
  }

  isWebViewFocused() {
    return this.browserWindow.isWebViewFocused();
  }

  isSpecWindow() {
    return this.isSpec;
  }

  reload() {
    this.browserWindow.reload();
  }

  toggleDevTools() {
    this.browserWindow.toggleDevTools();
  }
};
