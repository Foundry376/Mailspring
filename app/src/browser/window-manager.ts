import _ from 'underscore';
import { app, BrowserWindow } from 'electron';
import WindowLauncher from './window-launcher';
import { localized } from '../intl';
import MailspringWindow from './mailspring-window';

const MAIN_WINDOW = 'default';
const SPEC_WINDOW = 'spec';
const ONBOARDING_WINDOW = 'onboarding';
const CALENDAR_WINDOW = 'calendar';

export default class WindowManager {
  static MAIN_WINDOW = MAIN_WINDOW;
  static SPEC_WINDOW = SPEC_WINDOW;
  static ONBOARDING_WINDOW = ONBOARDING_WINDOW;
  static CALENDAR_WINDOW = CALENDAR_WINDOW;

  initializeInBackground: boolean;
  _windows: { [key: string]: MailspringWindow } = {};
  windowLauncher: WindowLauncher;

  constructor({
    devMode,
    safeMode,
    specMode,
    resourcePath,
    configDirPath,
    initializeInBackground,
    config,
  }) {
    this.initializeInBackground = initializeInBackground;

    const onCreatedHotWindow = win => {
      this._registerWindow(win);
      this._didCreateNewWindow(win);
    };
    this.windowLauncher = new WindowLauncher({
      devMode,
      safeMode,
      specMode,
      resourcePath,
      configDirPath,
      config,
      onCreatedHotWindow,
    });
  }

  get(windowKey) {
    return this._windows[windowKey];
  }

  getOpenWindows() {
    const values = [];
    Object.keys(this._windows).forEach(key => {
      const win = this._windows[key];
      if (win.windowType !== WindowLauncher.EMPTY_WINDOW) {
        values.push(win);
      }
    });

    const score = win => (win.loadSettings().mainWindow ? 1000 : win.browserWindow.id);

    return values.sort((a, b) => score(b) - score(a));
  }

  getOpenWindowCount() {
    return this.getOpenWindows().length;
  }

  getVisibleWindows() {
    const values = [];
    Object.keys(this._windows).forEach(key => {
      const win = this._windows[key];
      if (win.isVisible()) {
        values.push(win);
      }
    });

    return values;
  }

  getVisibleWindowCount() {
    return this.getVisibleWindows().length;
  }

  getAllWindowDimensions() {
    const dims = {};
    Object.keys(this._windows).forEach(key => {
      const win = this._windows[key];
      if (win.windowType !== WindowLauncher.EMPTY_WINDOW) {
        const { x, y, width, height } = win.browserWindow.getBounds();
        const maximized = win.browserWindow.isMaximized();
        const fullScreen = win.browserWindow.isFullScreen();
        dims[key] = { x, y, width, height, maximized, fullScreen };
      }
    });
    return dims;
  }

  newWindow(options = {}) {
    const win = this.windowLauncher.newWindow(options);
    const existingKey = this._registeredKeyForWindow(win);

    if (existingKey) {
      delete this._windows[existingKey];
    }
    this._registerWindow(win);

    if (!existingKey) {
      this._didCreateNewWindow(win);
    }

    return win;
  }

  _registerWindow = win => {
    if (!win.windowKey) {
      throw new Error('WindowManager: You must provide a windowKey');
    }

    if (this._windows[win.windowKey]) {
      throw new Error(
        `WindowManager: Attempting to register a new window for an existing windowKey (${
          win.windowKey
        }). Use 'get()' to retrieve the existing window instead.`
      );
    }

    this._windows[win.windowKey] = win;
  };

  _didCreateNewWindow = win => {
    win.browserWindow.on('closed', () => {
      delete this._windows[win.windowKey];
      if (this.windowLauncher.hotWindow === win) {
        this.windowLauncher.hotWindow = null;
      }
      this.quitWinLinuxIfNoWindows();
    });

    // Let the applicationMenu know that there's a new window available.
    // The applicationMenu automatically listens to the `closed` event of
    // the browserWindow to unregister itself
    global.application.applicationMenu.addWindow(win.browserWindow);
  };

  _registeredKeyForWindow = win => {
    for (const key of Object.keys(this._windows)) {
      const otherWin = this._windows[key];
      if (win === otherWin) {
        return key;
      }
    }
    return null;
  };

  ensureWindow(windowKey, extraOpts = {}) {
    const win = this._windows[windowKey];

    if (!win) {
      this.newWindow(this._coreWindowOpts(windowKey, extraOpts));
      return;
    }

    if (win.loadSettings().hidden) {
      return;
    }

    if (win.isMinimized()) {
      win.restore();
      win.focus();
    } else if (!win.isVisible()) {
      win.showWhenLoaded();
    } else {
      win.focus();
    }
  }

  sendToAllWindows(msg, { except }: { except?: BrowserWindow }, ...args) {
    for (const windowKey of Object.keys(this._windows)) {
      const win = this._windows[windowKey];
      if (win.browserWindow === except) {
        continue;
      }
      if (!win.browserWindow.webContents) {
        continue;
      }
      if (win.windowType === WindowLauncher.EMPTY_WINDOW) {
        continue;
      }
      win.browserWindow.webContents.send(msg, ...args);
    }
  }

  destroyAllWindows() {
    this.windowLauncher.cleanupBeforeAppQuit();
    for (const windowKey of Object.keys(this._windows)) {
      this._windows[windowKey].browserWindow.destroy();
    }
    this._windows = {};
  }

  cleanupBeforeAppQuit() {
    this.windowLauncher.cleanupBeforeAppQuit();
  }

  quitWinLinuxIfNoWindows() {
    // Typically, Mailspring stays running in the background on all platforms,
    // since it has a status icon you can use to quit it.

    // However, on Windows and Linux we /do/ want to quit if the app is somehow
    // put into a state where there are no visible windows and the main window
    // doesn't exist.

    // This /shouldn't/ happen, but if it does, the only way for them to recover
    // would be to pull up the Task Manager. Ew.

    if (['win32', 'linux'].includes(process.platform)) {
      this.quitCheck();
    }
  }

  quitCheck = _.debounce(() => {
    const visibleWindows = _.filter(this._windows, win => win.isVisible());
    const mainWindow = this.get(WindowManager.MAIN_WINDOW);
    const noMainWindowLoaded = !mainWindow || !mainWindow.isLoaded();
    if (visibleWindows.length === 0 && noMainWindowLoaded) {
      app.quit();
    }
  }, 25000);

  focusedWindow() {
    return _.find(this._windows, win => win.isFocused());
  }

  _coreWindowOpts(windowKey, extraOpts = {}) {
    const coreWinOpts = {};
    coreWinOpts[WindowManager.MAIN_WINDOW] = {
      windowKey: WindowManager.MAIN_WINDOW,
      windowType: WindowManager.MAIN_WINDOW,
      title: localized('Message Viewer'),
      toolbar: true,
      neverClose: true,
      bootstrapScript: require.resolve('../window-bootstrap'),
      mainWindow: true,
      width: 900, // Gets changed based on previous settings
      height: 600, // Gets changed based on previous settings
      initializeInBackground: this.initializeInBackground,
    };

    coreWinOpts[WindowManager.ONBOARDING_WINDOW] = {
      windowKey: WindowManager.ONBOARDING_WINDOW,
      windowType: WindowManager.ONBOARDING_WINDOW,
      title: localized('Set up Account'),
      hidden: true, // Displayed by PageRouter::_initializeWindowSize
      frame: false, // Always false on Mac, explicitly set for Win & Linux
      toolbar: false,
      resizable: false,
      width: 900,
      height: 600,
    };

    // The SPEC_WINDOW gets passed its own bootstrapScript
    coreWinOpts[WindowManager.CALENDAR_WINDOW] = {
      windowKey: WindowManager.CALENDAR_WINDOW,
      windowType: WindowManager.CALENDAR_WINDOW,
      title: localized('Calendar Preview'),
      width: 900,
      height: 600,
      frame: false,
      toolbar: true,
      hidden: false,
    };

    // The SPEC_WINDOW gets passed its own bootstrapScript
    coreWinOpts[WindowManager.SPEC_WINDOW] = {
      windowKey: WindowManager.SPEC_WINDOW,
      windowType: WindowManager.SPEC_WINDOW,
      title: 'Specs',
      frame: true,
      hidden: true,
      isSpec: true,
      devMode: true,
      toolbar: false,
    };

    const defaultOptions = coreWinOpts[windowKey] || {};

    return Object.assign({}, defaultOptions, extraOpts);
  }
}
