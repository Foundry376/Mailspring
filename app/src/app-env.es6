/* eslint global-require: 0 */
/* eslint import/no-dynamic-require: 0 */
import _ from 'underscore';
import path from 'path';
import { ipcRenderer, remote, desktopCapturer } from 'electron';
import { Emitter } from 'event-kit';
import { mapSourcePosition } from 'source-map-support';
import fs from 'fs';
import stream from 'stream';
import { APIError } from './flux/errors';
import WindowEventHandler from './window-event-handler';
import { createHash } from 'crypto';
const LOG = require('electron-log');
const archiver = require('archiver');
let getOSInfo = null;
let getDeviceHash = null;

function ensureInteger(f, fallback) {
  let int = f;
  if (isNaN(f) || f === undefined || f === null) {
    int = fallback;
  }
  return Math.round(int);
}

// Essential: AppEnv global for dealing with packages, themes, menus, and the window.
//
// The singleton of this class is always available as the `AppEnv` global.
export default class AppEnvConstructor {
  // Returns the load settings hash associated with the current window.
  static getLoadSettings() {
    if (this.loadSettings == null) {
      this.loadSettings = JSON.parse(decodeURIComponent(window.location.search.substr(14)));
    }
    return this.loadSettings;
  }

  static getCurrentWindow() {
    return remote.getCurrentWindow();
  }

  /*
  Section: Construction and Destruction
  */
  constructor() {
    // self-assign us to `window` so things called from this function can reference
    // window.AppEnv early.
    window.AppEnv = this;

    this.emitter = new Emitter();
    this.enhanceEventObject();
    this.setupErrorLogger();
    this.restoreWindowState();

    const { devMode, safeMode, resourcePath, configDirPath, windowType } = this.getLoadSettings();
    const specMode = this.inSpecMode();

    // Add 'src/global/' to module search path.
    const globalPath = path.join(resourcePath, 'src', 'global');
    require('module').globalPaths.push(globalPath);

    this.loadTime = null;

    const Config = require('./config');
    const KeymapManager = require('./keymap-manager').default;
    const CommandRegistry = require('./registries/command-registry').default;
    const PackageManager = require('./package-manager').default;
    const ThemeManager = require('./theme-manager').default;
    const StyleManager = require('./style-manager').default;
    const MenuManager = require('./menu-manager').default;

    document.body.classList.add(`platform-${process.platform}`);
    document.body.classList.add(`window-type-${windowType}`);

    // Make react.js faster
    if (!devMode && process.env.NODE_ENV == null) {
      process.env.NODE_ENV = 'production';
    }
    // if (devMode) {
    this.enabledToNativeLog = true;
    this.enabledFromNativeLog = true;
    this.enabledBackgroundQueryLog = true;
    this.enabledLocalQueryLog = true;
    this.enabledXmppLog = true;
    // LOG.transports.file.fileName = `ui-log-${Date.now()}.log`;
    LOG.transports.file.file = path.join(
      this.getConfigDirPath(),
      'ui-log',
      `ui-log-${Date.now()}.log`
    );
    LOG.transports.console.level = false;
    // if (devMode) {
    //   LOG.transports.file.appName = 'EdisonMail-dev';
    // } else {
    //   LOG.transports.file.appName = 'EdisonMail';
    // }
    // }

    // Setup config and load it immediately so it's available to our singletons
    // and doesn't emit events later when it loads
    this.config = new Config({ configDirPath, resourcePath });
    this.loadConfig();

    this.keymaps = new KeymapManager({ configDirPath, resourcePath });
    this.commands = new CommandRegistry();
    this.packages = new PackageManager({
      devMode,
      configDirPath,
      resourcePath,
      safeMode,
      specMode,
    });
    this.styles = new StyleManager();
    this.themes = new ThemeManager({
      packageManager: this.packages,
      configDirPath,
      resourcePath,
      safeMode,
    });
    this.themes.activateThemePackage();

    this.spellchecker = require('./spellchecker').default;
    this.menu = new MenuManager({ resourcePath, devMode });
    if (process.platform === 'win32') {
      this.getCurrentWindow().setMenuBarVisibility(false);
    }

    this.windowEventHandler = new WindowEventHandler();

    // tracking
    const TrackingAppEvents = require('./tracking-utils').default;
    this.trackingEvent = TrackingAppEvents.trackingEvent;
    this.trackingTask = TrackingAppEvents.trackingTask;

    // We extend observables with our own methods. This happens on
    // require of mailspring-observables
    require('mailspring-observables');

    // Mailspring exports is designed to provide a lazy-loaded set of globally
    // accessible objects to all packages. Upon require, mailspring-exports will
    // fill the StoreRegistry, and DatabaseObjectRegistries
    // with various constructors.
    //
    // We initialize all of the stores loaded into the StoreRegistry once
    // the window starts loading.
    require('mailspring-exports');

    const ActionBridge = require('./flux/action-bridge').default;
    this.actionBridge = new ActionBridge(ipcRenderer);

    const MailsyncBridge = require('./flux/mailsync-bridge').default;
    this.mailsyncBridge = new MailsyncBridge();

    process.title = `EdisonMail ${this.getWindowType()}`;
    this.onWindowPropsReceived(() => {
      process.title = `EdisonMail ${this.getWindowType()}`;
    });
    this.initSupportInfo();
    this.initTaskErrorCounter();

    // subscribe event of dark mode change
    const { systemPreferences } = remote;
    if (this.isMainWindow()) {
      systemPreferences.subscribeNotification('AppleInterfaceThemeChangedNotification', () => {
        AppEnv.themes.setActiveTheme(systemPreferences.isDarkMode() ? 'ui-dark' : 'ui-light');
      });
    }
  }
  sendSyncMailNow(accountId) {
    if (navigator.onLine) {
      console.log(`sync mail to ${accountId}:` + new Date().toISOString());
      this.mailsyncBridge.sendSyncMailNow(accountId);
    } else {
      console.log(`network is offline. skip sync.`);
    }
  }

  // This ties window.onerror and process.uncaughtException,handledRejection
  // to the publically callable `reportError` method. This will take care of
  // reporting errors if necessary and hooking into error handling
  // callbacks.
  //
  // Start our error reporting to the backend and attach error handlers
  // to the window and the Bluebird Promise library, converting things
  // back through the sourcemap as necessary.
  setupErrorLogger() {
    const ErrorLogger = require('./error-logger');
    this.errorLogger = new ErrorLogger({
      inSpecMode: this.inSpecMode(),
      inDevMode: this.inDevMode(),
      resourcePath: this.getLoadSettings().resourcePath,
    });

    const sourceMapCache = {};

    // https://developer.mozilla.org/en-US/docs/Web/API/GlobalEventHandlers/onerror
    window.onerror = (message, url, line, column, originalError) => {
      if (!this.inDevMode()) {
        return this.reportError(originalError, { url, line, column });
      }
      const { line: newLine, column: newColumn } = mapSourcePosition({ source: url, line, column });
      return this.reportError(originalError, { url, line: newLine, column: newColumn });
    };

    process.on('uncaughtException', e => {
      this.reportError(e);
    });

    process.on('unhandledRejection', error => {
      this._onUnhandledRejection(error, sourceMapCache);
    });

    window.addEventListener('unhandledrejection', e => {
      // This event is supposed to look like {reason, promise}, according to
      // https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
      // In practice, it can have different shapes, so we make our best guess
      if (!e) {
        const error = new Error(`Unknown window.unhandledrejection event.`);
        this._onUnhandledRejection(error, sourceMapCache);
        return;
      }
      if (e instanceof Error) {
        this._onUnhandledRejection(e, sourceMapCache);
        return;
      }
      if (e.reason) {
        const error = e.reason;
        this._onUnhandledRejection(error, sourceMapCache);
        return;
      }
      if (e.detail && e.detail.reason) {
        const error = e.detail.reason;
        this._onUnhandledRejection(error, sourceMapCache);
        return;
      }
      const error = new Error(
        `Unrecognized event shape in window.unhandledrejection handler. Event keys: ${Object.keys(
          e
        )}`
      );
      this._onUnhandledRejection(error, sourceMapCache);
    });

    return null;
  }

  debugLog(msg) {
    this.logDebug(msg);
  }

  mockDiskLow() {
    const SystemInfoStore = require('./flux/stores/system-info-store').default;
    SystemInfoStore._mockDiskLow();
  }

  _onUnhandledRejection = (error, sourceMapCache) => {
    this.reportError(error, { errorData: sourceMapCache }, { grabLogs: true });
  };
  _expandReportLog(error, extra = {}) {
    try {
      getOSInfo = getOSInfo || require('./system-utils').getOSInfo;
      extra.osInfo = getOSInfo();
      extra.chatEnabled = this.config.get('chatEnable');
      extra.appConfig = JSON.stringify(this.config.cloneForErrorLog());
      extra.pluginIds = JSON.stringify(this._findPluginsFromError(error));
      if (!!extra.errorData) {
        extra.errorData = JSON.stringify(extra.errorData);
      }
    } catch (err) {
      // can happen when an error is thrown very early
      extra.pluginIds = [];
    }
    return extra;
  }

  // Public: report an error through the `ErrorLogger`
  //
  // The difference between this and `ErrorLogger.reportError` is that
  // `AppEnv.reportError` hooks into test failures and dev tool popups.
  //
  reportError(error, extra = {}, { noWindows, grabLogs = false } = {}) {
    if (grabLogs && !this.inDevMode()) {
      this._grabLogAndReportLog(error, extra, { noWindows }, 'error');
    } else {
      this._reportLog(error, extra, { noWindows }, 'error');
    }
  }

  reportWarning(error, extra = {}, { noWindows, grabLogs = false } = {}) {
    if (grabLogs && !this.inDevMode()) {
      this._grabLogAndReportLog(error, extra, { noWindows }, 'warning');
    } else {
      this._reportLog(error, extra, { noWindows }, 'warning');
    }
  }
  reportLog(error, extra = {}, { noWindows, grabLogs = false } = {}) {
    if (grabLogs && !this.inDevMode()) {
      this._grabLogAndReportLog(error, extra, { noWindows }, 'log');
    } else {
      this._reportLog(error, extra, { noWindows }, 'log');
    }
  }

  _grabLogAndReportLog(error, extra, { noWindows } = {}, type = '') {
    this.grabLogs()
      .then(filename => {
        extra.files = [filename];
        this._reportLog(error, extra, { noWindows }, type);
      })
      .catch(e => {
        extra.grabLogError = e;
        this._reportLog(error, extra, { noWindows }, type);
      });
  }

  _reportLog(error, extra = {}, { noWindows } = {}, type = '') {
    extra = this._expandReportLog(error, extra);

    if (error instanceof APIError) {
      // API Errors are logged by our backend and happen all the time (offline, etc.)
      // Don't clutter the front-end metrics with these.
      return;
    }

    if (this.inSpecMode()) {
      if (global.jasmine || window.jasmine) {
        jasmine.getEnv().currentSpec.fail(error);
      }
    } else if (this.inDevMode() && !noWindows) {
      if (!this.isDevToolsOpened()) {
        this.openDevTools();
        this.executeJavaScriptInDevTools("DevToolsAPI.showPanel('console')");
      }
    }
    if (type.toLocaleLowerCase() === 'error') {
      this.logError(error);
    } else if (type.toLocaleLowerCase() === 'warning') {
      this.logWarning(error);
    } else {
      this.logDebug(error);
    }
    try {
      const strippedError = this._stripSensitiveData(error);
      error = strippedError;
      if (!!extra.errorData) {
        extra.errorData = this._stripSensitiveData(extra.errorData);
      }
    } catch (e) {
      console.log(e);
    }
    if (type.toLocaleLowerCase() === 'error') {
      this.errorLogger.reportError(error, extra);
    } else if (type.toLocaleLowerCase() === 'warning') {
      this.errorLogger.reportWarning(error, extra);
    } else {
      this.errorLogger.reportLog(error, extra);
    }
  }

  initSupportInfo() {
    if (!getDeviceHash) {
      getDeviceHash = require('./system-utils').getDeviceHash;
    }
    const deviceHash = this.config.get('core.support.id');
    if (!deviceHash || deviceHash === 'Unknown') {
      getDeviceHash()
        .then(id => {
          this.config.set('core.support.id', id);
        })
        .catch(e => {
          AppEnv.reportError(new Error('failed to init support id'));
          this.config.set('core.support.id', 'Unknown');
        });
    }
  }

  _stripSensitiveData(str = '') {
    const _stripData = (key, strData) => {
      let leftStr = '"';
      let leftRegStr = leftStr;
      let rightStr = '"';
      let rightRegStr = rightStr;
      let reg = new RegExp(`"${key}(\\\\":\\\\"|":")(\\s|\\S)*?(","|"}|\\\\",\\\\"|\\\\"})`, 'g');
      if (
        key !== 'body' &&
        key !== 'subject' &&
        key !== 'snippet' &&
        key !== 'emailAddress' &&
        key !== 'imap_username' &&
        key !== 'imap_password' &&
        key !== 'smtp_username' &&
        key !== 'smtp_password' &&
        key !== 'access_token' &&
        key !== 'refresh_token'
      ) {
        leftRegStr = '\\[';
        rightRegStr = '\\]';
        reg = new RegExp(`"${key}":${leftRegStr}(\\s|\\S)*?${rightRegStr},"`, 'g');
      }

      return strData.replace(reg, (str, match) => {
        const hash = createHash('md5')
          .update(str.replace(`"${key}":${leftStr}`, '').replace(`${rightRegStr},"`, ''))
          .digest('hex');
        return `"${key}":${leftStr}${hash}${rightStr},"`;
      });
    };
    const sensitiveKeys = [
      'emailAddress',
      'imap_username',
      'imap_password',
      'smtp_username',
      'smtp_password',
      'access_token',
      'refresh_token',
      'body',
      'subject',
      'snippet',
      'to',
      'from',
      'cc',
      'bcc',
      'replyTo',
    ];
    const notString = typeof str !== 'string';
    if (notString) {
      str = str.toLocaleString();
    }
    for (let i = 0; i < sensitiveKeys.length; i++) {
      const key = sensitiveKeys[i];
      str = _stripData(key, str);
    }
    if (notString) {
      str = Error(str);
    }
    return str;
  }

  logError(log) {
    this._log(log, 'error');
  }

  logWarning(log) {
    this._log(log, 'warn');
  }

  logDebug(log) {
    this._log(log, 'debug');
  }

  logInfo(log) {
    this._log(log, 'info');
  }

  _log(message, logType = 'log') {
    if (this.inDevMode()) {
      if (logType === 'error') {
        console.error(message);
      } else if (logType === 'warn') {
        console.warn(message);
      } else {
        console.log(message);
      }
    }
    let str = message;
    if (str && str.toLocaleString) {
      str = this._stripSensitiveData(str.toLocaleString());
    }
    LOG[logType](str);
  }

  _findPluginsFromError(error) {
    if (!error.stack) {
      return [];
    }
    const stackPaths = error.stack.match(/((?:\/[\w-_]+)+)/g) || [];
    const stackPathComponents = _.uniq(_.flatten(stackPaths.map(p => p.split('/'))));

    const names = [];
    for (const pkg of this.packages.getActivePackages()) {
      if (stackPathComponents.includes(path.basename(pkg.directory))) {
        names.push(pkg.name);
      }
    }
    return names;
  }

  /*
  Section: Event Subscription
  */

  isMainWindow() {
    return !!this.getLoadSettings().mainWindow;
  }

  isEmptyWindow() {
    return this.getWindowType() === 'emptyWindow';
  }

  isComposerWindow() {
    return this.getWindowType() === 'composer';
  }

  isThreadWindow() {
    return this.getWindowType() === 'thread-popout';
  }
  isOnboardingWindow() {
    return this.getWindowType() === 'onboarding';
  }

  isDisableZoomWindow() {
    return this.getLoadSettings().disableZoom;
  }

  getWindowType() {
    return this.getLoadSettings().windowType;
  }

  // Public: Is the current window in development mode?
  inDevMode() {
    return this.getLoadSettings().devMode;
  }

  // Public: Is the current window in safe mode?
  inSafeMode() {
    return this.getLoadSettings().safeMode;
  }

  // Public: Is the current window running specs?
  inSpecMode() {
    return this.getLoadSettings().isSpec;
  }

  // Public: Get the version of Mailspring.
  //
  // Returns the version text {String}.
  getVersion() {
    return this.appVersion != null
      ? this.appVersion
      : (this.appVersion = this.getLoadSettings().appVersion);
  }

  // Public: Determine whether the current version is an official release.
  isReleasedVersion() {
    // Check if the release contains a 7-character SHA prefix
    return !/\w{7}/.test(this.getVersion());
  }

  // Public: Get the directory path to Mailspring's configuration area.
  getConfigDirPath() {
    return this.getLoadSettings().configDirPath;
  }

  // Public: Get the time taken to completely load the current window.
  //
  // This time include things like loading and activating packages, creating
  // DOM elements for the editor, and reading the config.
  //
  // Returns the {Number} of milliseconds taken to load the window or null
  // if the window hasn't finished loading yet.
  getWindowLoadTime() {
    return this.loadTime;
  }

  // Public: Get the load settings for the current window.
  //
  // Returns an {Object} containing all the load setting key/value pairs.
  getLoadSettings() {
    return this.constructor.getLoadSettings();
  }
  setWindowDisplayTitle(title) {
    const loadSettings = this.getLoadSettings();
    loadSettings.title = title;
    this.loadSettings = loadSettings;
    this.emitter.emit('window-props-received', this.loadSettings.windowProps);
  }
  setWindowTitle(title) {
    this.getCurrentWindow().setTitle(title);
  }

  /*
  Section: Managing The Nylas Window
  */

  // Essential: Close the current window.
  close(options) {
    if (options) {
      if (!options.windowLevel) {
        if (this.isComposerWindow()) {
          options.windowLevel = 3;
        } else if (this.isThreadWindow()) {
          options.windowLevel = 2;
        } else {
          options.windowLevel = 1;
        }
      }
      ipcRenderer.send(`close-window`, options);
    } else {
      // console.log('no options send for appenv.close');
    }
    return this.getCurrentWindow().close();
  }

  quit() {
    return remote.app.quit();
  }

  // Essential: Get the size of current window.
  //
  // Returns an {Object} in the format `{width: 1000, height: 700}`
  getSize() {
    const [width, height] = Array.from(this.getCurrentWindow().getSize());
    return { width, height };
  }

  // Essential: Set the size of current window.
  //
  // * `width` The {Number} of pixels.
  // * `height` The {Number} of pixels.
  setSize(width, height) {
    return this.getCurrentWindow().setSize(ensureInteger(width, 100), ensureInteger(height, 100));
  }

  setMinimumWidth(minWidth) {
    const win = this.getCurrentWindow();
    const minHeight = win.getMinimumSize()[1];
    win.setMinimumSize(ensureInteger(minWidth, 0), minHeight);

    const [currWidth, currHeight] = Array.from(win.getSize());
    if (minWidth > currWidth) {
      win.setSize(minWidth, currHeight);
    }
  }

  // Essential: Get the position of current window.
  //
  // Returns an {Object} in the format `{x: 10, y: 20}`
  getPosition() {
    const [x, y] = Array.from(this.getCurrentWindow().getPosition());
    return { x, y };
  }

  // Essential: Set the position of current window.
  //
  // * `x` The {Number} of pixels.
  // * `y` The {Number} of pixels.
  setPosition(x, y) {
    return ipcRenderer.send(
      'call-window-method',
      'setPosition',
      ensureInteger(x, 0),
      ensureInteger(y, 0)
    );
  }

  // Extended: Get the current window
  getCurrentWindow() {
    return this.constructor.getCurrentWindow();
  }

  // Extended: Move current window to the center of the screen.
  center() {
    if (process.platform === 'linux') {
      let dimensions = this.getWindowDimensions();
      let display =
        remote.screen.getDisplayMatching(dimensions) || remote.screen.getPrimaryDisplay();
      let x = display.bounds.x + (display.bounds.width - dimensions.width) / 2;
      let y = display.bounds.y + (display.bounds.height - dimensions.height) / 2;

      return this.setPosition(x, y);
    } else {
      return ipcRenderer.send('call-window-method', 'center');
    }
  }

  // Extended: Focus the current window. Note: this will not open the window
  // if it is hidden.
  focus() {
    ipcRenderer.send('call-window-method', 'focus');
    return window.focus();
  }

  // Extended: Show the current window.
  show() {
    return ipcRenderer.send('call-window-method', 'show');
  }

  fakeEmit(msg) {
    this.mailsyncBridge.fakeEmit([msg]);
  }
  fakeToNative(task) {
    this.mailsyncBridge.fakeTask(task);
  }

  isVisible() {
    return this.getCurrentWindow().isVisible();
  }

  // Extended: Hide the current window.
  hide() {
    return ipcRenderer.send('call-window-method', 'hide');
  }

  // Extended: Reload the current window.
  reload() {
    this.isReloading = true;
    return ipcRenderer.send('call-webcontents-method', 'reload');
  }

  // Public: The windowProps passed when creating the window via `newWindow`.
  //
  getWindowProps() {
    return this.getLoadSettings().windowProps || {};
  }

  // Public: If your package declares hot-loaded window types, `onWindowPropsReceived`
  // fires when your hot-loaded window is about to be shown so you can update
  // components to reflect the new window props.
  //
  // - callback: A function to call when window props are received, just before
  //   the hot window is shown. The first parameter is the new windowProps.
  //
  onWindowPropsReceived(callback) {
    return this.emitter.on('window-props-received', callback);
  }

  // Extended: Is the current window maximized?
  isMaximixed() {
    return this.getCurrentWindow().isMaximized();
  }
  unmaximize() {
    return ipcRenderer.send('call-window-method', 'unmaximize');
  }

  maximize() {
    return ipcRenderer.send('call-window-method', 'maximize');
  }

  minimize() {
    return ipcRenderer.send('call-window-method', 'minimize');
  }

  // Extended: Is the current window in full screen mode?
  isFullScreen() {
    return this.getCurrentWindow().isFullScreen();
  }

  // Extended: Set the full screen state of the current window.
  setFullScreen(fullScreen = false) {
    ipcRenderer.send('call-window-method', 'setFullScreen', fullScreen);
    if (fullScreen) {
      return document.body.classList.add('fullscreen');
    }
    return document.body.classList.remove('fullscreen');
  }

  // Extended: Toggle the full screen state of the current window.
  toggleFullScreen() {
    return this.setFullScreen(!this.isFullScreen());
  }

  // Get the dimensions of this window.
  //
  // Returns an {Object} with the following keys:
  //   * `x`      The window's x-position {Number}.
  //   * `y`      The window's y-position {Number}.
  //   * `width`  The window's width {Number}.
  //   * `height` The window's height {Number}.
  getWindowDimensions() {
    const browserWindow = this.getCurrentWindow();
    const { x, y, width, height } = browserWindow.getBounds();
    const maximized = browserWindow.isMaximized();
    const fullScreen = browserWindow.isFullScreen();
    return { x, y, width, height, maximized, fullScreen };
  }

  // Set the dimensions of the window.
  //
  // The window will be centered if either the x or y coordinate is not set
  // in the dimensions parameter. If x or y are omitted the window will be
  // centered. If height or width are omitted only the position will be changed.
  //
  // * `dimensions` An {Object} with the following keys:
  //   * `x` The new x coordinate.
  //   * `y` The new y coordinate.
  //   * `width` The new width.
  //   * `height` The new height.
  setWindowDimensions({ x, y, width, height }) {
    if (x != null && y != null && width != null && height != null) {
      return this.getCurrentWindow().setBounds({ x, y, width, height });
    } else if (width != null && height != null) {
      return this.setSize(width, height);
    } else if (x != null && y != null) {
      return this.setPosition(x, y);
    }
    return this.center();
  }

  // Returns true if the dimensions are useable, false if they should be ignored.
  // Work around for https://github.com/atom/electron/issues/473
  isValidDimensions({ x, y, width, height } = {}) {
    return width > 0 && height > 0 && x + width > 0 && y + height > 0;
  }

  getDefaultWindowDimensions() {
    let { width, height } = remote.screen.getPrimaryDisplay().workAreaSize;
    let x = 0;
    let y = 0;

    const MAX_WIDTH = 1440;
    if (width > MAX_WIDTH) {
      x = Math.floor((width - MAX_WIDTH) / 2);
      width = MAX_WIDTH;
    }

    const MAX_HEIGHT = 900;
    if (height > MAX_HEIGHT) {
      y = Math.floor((height - MAX_HEIGHT) / 2);
      height = MAX_HEIGHT;
    }

    return { x, y, width, height };
  }

  restoreWindowDimensions() {
    let dimensions = this.savedState.windowDimensions;
    if (!this.isValidDimensions(dimensions)) {
      dimensions = this.getDefaultWindowDimensions();
    }
    this.setWindowDimensions(dimensions);
    if (dimensions.maximized && process.platform !== 'darwin') {
      this.maximize();
    }
    if (dimensions.fullScreen) {
      this.setFullScreen(true);
    }
  }

  storeWindowDimensions() {
    const dimensions = this.getWindowDimensions();
    if (this.isValidDimensions(dimensions)) {
      this.savedState.windowDimensions = dimensions;
    }
  }

  storeColumnWidth({ id, width }) {
    if (this.savedState.columnWidths == null) {
      this.savedState.columnWidths = {};
    }
    this.savedState.columnWidths[id] = width;
  }

  getColumnWidth(id) {
    if (this.savedState.columnWidths == null) {
      this.savedState.columnWidths = {};
    }
    return this.savedState.columnWidths[id];
  }

  async startWindow() {
    const { windowType } = this.getLoadSettings();

    this.themes.loadStaticStylesheets();
    this.initializeBasicSheet();
    this.initializeReactRoot();
    this.packages.activatePackages(windowType);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            this.keymaps.loadKeymaps();
            this.menu.update();

            ipcRenderer.send('window-command', 'window:loaded');
          });
        });
      });
    });
  }

  // Call this method when establishing a real application window.
  async startRootWindow() {
    this.restoreWindowDimensions();
    this.getCurrentWindow().setMinimumSize(875, 250);
    await this.startWindow();
  }

  // Initializes a secondary window.
  // NOTE: If the `packageLoadingDeferred` option is set (which is true for
  // hot windows), the packages won't be loaded until `populateHotWindow`
  // gets fired.
  async startSecondaryWindow() {
    await this.startWindow();
    ipcRenderer.on('load-settings-changed', (...args) => this.populateHotWindow(...args));
  }

  // We setup the initial Sheet for hot windows. This is the default title
  // bar, stoplights, etc. This saves ~100ms when populating the hot
  // windows.
  initializeBasicSheet() {
    const WorkspaceStore = require('../src/flux/stores/workspace-store');
    if (!WorkspaceStore.Sheet.Main) {
      WorkspaceStore.defineSheet(
        'Main',
        { root: true },
        {
          popout: ['Center'],
        }
      );
    }
  }

  // Updates the window load settings - called when the app is ready to
  // display a hot-loaded window. Causes listeners registered with
  // `onWindowPropsReceived` to receive new window props.
  //
  // This also means that the windowType has changed and a different set of
  // plugins needs to be loaded.
  populateHotWindow(event, loadSettings) {
    this.loadSettings = loadSettings;
    this.constructor.loadSettings = loadSettings;

    this.packages.activatePackages(loadSettings.windowType);

    this.emitter.emit(
      'window-props-received',
      loadSettings.windowProps != null ? loadSettings.windowProps : {}
    );

    const browserWindow = this.getCurrentWindow();
    if (browserWindow.isResizable() !== loadSettings.resizable) {
      browserWindow.setResizable(loadSettings.resizable);
    }

    if (!loadSettings.hidden) {
      this.displayWindow();
    }
  }

  // Launches a new window via the browser/WindowLauncher.
  //
  // If you pass a `windowKey` in the options, and that windowKey already
  // exists, it'll show that window instead of spawing a new one. This is
  // useful for places like popout composer windows where you want to
  // simply display the draft instead of spawning a whole new window for
  // the same draft.
  //
  // `options` are documented in browser/WindowLauncher
  newWindow(options = {}) {
    return ipcRenderer.send('new-window', options);
  }

  saveWindowStateAndUnload() {
    this.packages.deactivatePackages();
    this.saveWindowState();
  }

  /*
  Section: Messaging the User
  */

  displayWindow({ maximize } = {}) {
    if (this.inSpecMode()) {
      return;
    }
    this.show();
    this.focus();
    if (maximize) this.maximize();
  }

  /*
  Section: Managing the Dev Tools
  */

  // Extended: Open the dev tools for the current window.
  openDevTools() {
    return ipcRenderer.send('call-webcontents-method', 'openDevTools');
  }

  isDevToolsOpened() {
    return this.getCurrentWindow().webContents.isDevToolsOpened();
  }

  // Extended: Toggle the visibility of the dev tools for the current window.
  toggleDevTools() {
    return ipcRenderer.send('call-webcontents-method', 'toggleDevTools');
  }

  // Extended: Execute code in dev tools.
  executeJavaScriptInDevTools(code) {
    return ipcRenderer.send('call-devtools-webcontents-method', 'executeJavaScript', code);
  }

  /*
  Section: Private
  */

  initializeReactRoot() {
    // Put state back into sheet-container? Restore app state here
    this.item = document.createElement('mailspring-workspace');
    this.item.setAttribute('id', 'sheet-container');
    this.item.setAttribute('class', 'sheet-container');
    this.item.setAttribute('tabIndex', '-1');

    const React = require('react');
    const ReactDOM = require('react-dom');
    const SheetContainer = require('./sheet-container').default;
    ReactDOM.render(React.createElement(SheetContainer), this.item);

    if (this.inSpecMode()) {
      document.querySelector('#jasmine-content').appendChild(this.item);
    } else {
      document.body.appendChild(this.item);
    }
  }

  loadConfig() {
    this.config.setSchema(null, {
      type: 'object',
      properties: _.clone(require('./config-schema').default),
    });
    this.config.load();
  }

  exit(status) {
    remote.app.emit('will-exit');
    remote.process.exit(status);
  }

  showOpenDialog(options, callback) {
    return remote.dialog.showOpenDialog(this.getCurrentWindow(), options, callback);
  }

  showImageSelectionDialog(cb) {
    return remote.dialog.showOpenDialog(
      this.getCurrentWindow(),
      {
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Images',
            extensions: ['jpg', 'bmp', 'gif', 'png', 'jpeg'],
          },
        ],
      },
      cb
    );
  }

  showSaveDialog(options, callback) {
    if (options.title == null) {
      options.title = 'Save File';
    }
    return remote.dialog.showSaveDialog(this.getCurrentWindow(), options, callback);
  }

  showErrorDialog(messageData, { showInMainWindow, detail, async } = {}) {
    let message;
    let title;
    if (_.isString(messageData) || _.isNumber(messageData)) {
      message = messageData;
      title = 'Error';
    } else if (_.isObject(messageData)) {
      ({ message } = messageData);
      ({ title } = messageData);
    } else {
      throw new Error('Must pass a valid message to show dialog', message);
    }

    let winToShow = null;
    if (showInMainWindow) {
      winToShow = remote.getGlobal('application').getMainWindow();
    }

    if (!detail) {
      if (async) {
        return remote.dialog.showMessageBox(
          winToShow,
          {
            type: 'warning',
            buttons: ['Okay'],
            message: title,
            detail: message,
          },
          () => { }
        );
      }
      return remote.dialog.showMessageBox(winToShow, {
        type: 'warning',
        buttons: ['Okay'],
        message: title,
        detail: message,
      });
    }
    return remote.dialog.showMessageBox(
      winToShow,
      {
        type: 'warning',
        buttons: ['Okay', 'Show Details'],
        message: title,
        detail: message,
      },
      buttonIndex => {
        if (buttonIndex === 1) {
          const { Actions } = require('mailspring-exports');
          const { CodeSnippet } = require('mailspring-component-kit');
          Actions.openModal({
            component: CodeSnippet({ intro: message, code: detail, className: 'error-details' }),
            width: 500,
            height: 300,
          });
        }
      }
    );
  }

  // Delegate to the browser's process fileListCache
  fileListCache() {
    return remote.getGlobal('application').fileListCache;
  }

  getWindowStateKey() {
    return `window-state-${this.getWindowType()}`;
  }

  saveWindowState() {
    const stateString = JSON.stringify(this.savedState);
    window.localStorage.setItem(this.getWindowStateKey(), stateString);
  }

  restoreWindowState() {
    try {
      let stateString = window.localStorage.getItem(this.getWindowStateKey());
      if (stateString != null) {
        this.savedState = JSON.parse(stateString);
      }
    } catch (error) {
      console.warn(`Error parsing window state: ${error.stack}`, error);
    }
    if (!this.savedState) {
      this.savedState = {};
    }
  }

  crashMainProcess() {
    remote.process.crash();
  }

  crashRenderProcess() {
    process.crash();
  }

  onUpdateAvailable(callback) {
    return this.emitter.on('update-available', callback);
  }

  updateAvailable(details) {
    this.emitter.emit('update-available', details);
  }

  // Lets multiple components register beforeUnload callbacks.
  // The callbacks are expected to return either true or false.
  //
  // Note: If you return false to cancel the window close, you /must/ perform
  // work and then call finishUnload. We do not support cancelling quit!
  // https://phab.nylas.com/D1932#inline-11722
  //
  // Also see logic in browser/MailspringWindow::handleEvents where we listen
  // to the browserWindow.on 'close' event to catch "unclosable" windows.
  onBeforeUnload(callback) {
    return this.windowEventHandler.addUnloadCallback(callback);
  }

  onReadyToUnload(callback) {
    return this.windowEventHandler.addReadyToUnloadCallback(callback);
  }

  removeUnloadCallback(callback) {
    this.windowEventHandler.removeUnloadCallback(callback);
  }

  setTrayChatUnreadCount(count) {
    ipcRenderer.send('update-system-tray-chat-unread-count', count);
  }

  enhanceEventObject() {
    const overriddenStop = Event.prototype.stopPropagation;
    Event.prototype.stopPropagation = function stopPropagation(...args) {
      this.propagationStopped = true;
      return overriddenStop.apply(this, args);
    };
    Event.prototype.isPropagationStopped = function isPropagationStopped() {
      return this.propagationStopped;
    };
  }

  captureScreen() {
    return new Promise((resolve, reject) => {
      const resourcePath = this.getConfigDirPath();
      desktopCapturer.getSources(
        {
          types: ['window'],
          thumbnailSize: { width: 1200, height: 1200 },
        },
        (error, sources) => {
          if (error) {
            reject(error);
            return;
          }
          const ourApp = sources.filter(source => {
            return source.name === 'EdisonMail';
          });
          if (ourApp.length === 0) {
            reject('NOT FOUND');
            return;
          }
          if (!ourApp[0] || !ourApp[0].thumbnail) {
            reject('NOT FOUND');
            return;
          }
          const img = ourApp[0].thumbnail;
          if (!img.isEmpty()) {
            const outputPath = path.join(resourcePath, `${ourApp[0].name}.png`);
            const output = fs.createWriteStream(outputPath);
            const pass = new stream.PassThrough();
            pass.end(img.toPNG());
            pass.pipe(output);
            output.on('close', function () {
              output.close();
              resolve(outputPath);
            });
            output.on('end', function () {
              output.close();
              reject();
            });
            output.on('error', function () {
              output.close();
              reject();
            });
          } else {
            reject();
          }
        }
      );
    });
  }
  grabLogs(fileName = '') {
    return new Promise((resolve, reject) => {
      const resourcePath = this.getConfigDirPath();
      const logPath = path.dirname(LOG.transports.file.findLogPath());
      if (fileName === '') {
        fileName = parseInt(Date.now());
      }
      const outputPath = path.join(resourcePath, 'upload-log', `logs-${fileName}.zip`);
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Sets the compression level.
      });

      output.on('close', function () {
        console.log('\n--->\n' + archive.pointer() + ' total bytes\n');
        console.log('archiver has been finalized and the output file descriptor has closed.');
        resolve(outputPath);
      });
      output.on('end', function () {
        console.log('\n----->\nData has been drained');
        resolve(outputPath);
      });
      archive.on('warning', function (err) {
        if (err.code === 'ENOENT') {
          console.log(err);
        } else {
          output.close();
          console.log(err);
          reject(err);
        }
      });
      archive.on('error', function (err) {
        output.close();
        console.log(err);
        reject(err);
      });
      archive.pipe(output);
      archive.directory(logPath, 'uiLog');
      archive.glob(path.join(resourcePath, '*.log'), {}, { prefix: 'nativeLog' });
      archive.finalize();
    });
  }

  anonymizeAccount(account) {
    const ret = Object.assign({}, account);
    if (account) {
      const settings = Object.assign({}, ret.settings);
      delete settings.access_token;
      delete settings.imap_username;
      delete settings.smtp_username;
      ret.settings = settings;
      delete ret.label;
      delete ret.name;
      delete ret.emailAddress;
    }
    return ret;
  }
  initTaskErrorCounter() {
    this._taskErrorCounter = {};
  }

  pushTaskErrorCounter({ data = {}, accountId = '' } = {}) {
    if (!this._taskErrorCounter) {
      this._taskErrorCounter = {};
    }
    if (!accountId || accountId.length === 0) {
      return;

      if (!this._taskErrorCounter[accountId]) {
        this._taskErrorCounter[accountId] = [];
      }
      this._taskErrorCounter[accountId].push(data);
    }
  }

  filterTaskErrorCounter({ accountId = '', identityKey = '', value = null }) {
    if (!this._taskErrorCounter) {
      this._taskErrorCounter = {};
      return [];
    }
    if (!this._taskErrorCounter[accountId]) {
      return [];
    }
    return this._taskErrorCounter[accountId].filter(data => {
      if (data.hasOwnProperty(identityKey)) {
        return data[identityKey] === value;
      }
      return false;
    });
  }

  replaceTaskErrorCounter({ accountId = '', identityKey = '', value = null, data = {} }) {
    if (!this._taskErrorCounter) {
      this._taskErrorCounter = {};
    }
    if (!this._taskErrorCounter[accountId]) {
      return [];
    }
    for (let i = 0; i < this._taskErrorCounter[accountId].length; i++) {
      const tmp = this._taskErrorCounter[accountId][i];
      if (tmp.hasOwnProperty(identityKey)) {
        if (tmp[identityKey] === value) {
          this._taskErrorCounter[accountId][i] = Object.assign({}, data);
          break;
        }
      }
    }
  }
  // mockCal(){
  //    const calData = [
  //      "BEGIN:VCALENDAR",
  //   "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  //     "VERSION:2.0",
  //   "CALSCALE:GREGORIAN",
  //   "METHOD:REQUEST",
  //   "BEGIN:VEVENT",
  //   "DTSTART:20190805T233000Z",
  //   "DTEND:20190806T023000Z",
  //   "DTSTAMP:20190729T072426Z",
  //   "ORGANIZER;CN=gaogest@gmail.com:mailto:gaogest@gmail.com",
  //   "UID:6com6p1j70s30bb36ooj8b9kc4r68b9ocos3cbb46cqmap316crjedhgc8@google.com",
  //   "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=TRUE;CN=gaogest@gmail.com;X-NUM-GUESTS=0:mailto:gaogest@gmail.com",
  //   "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=ruoxi@edison.tech;X-NUM-GUESTS=0:mailto:ruoxi@edison.tech",
  //   "CREATED:20190729T072421Z",
  //   "LAST-MODIFIED:20190729T072424Z",
  //   "LOCATION:Antarctica",
  //   "SEQUENCE:0",
  //   "STATUS:CONFIRMED",
  //   "SUMMARY:Testing",
  //    "TRANSP:OPAQUE",
  //    "END:VEVENT",
  //    "END:VCALENDAR"].join('\r\n');
  //    const Calendar = require('./flux/models/calendar').default;
  //    const repeat = 300;
  //    const start = Date.now();
  //    for (let i =0; i< repeat; i++){
  //      const calendar = Calendar.parse(calData);
  //      const Event = calendar.getFirstEvent();
  //      console.log(Event.organizer);
  //    }
  //    console.log(`used ${Date.now() - start}ms`);
  // }
  printChromeVersion() {
    console.log(process.versions['chrome']);
  }
  generateHash(str) {
    console.log(
      createHash('md5')
        .update(str)
        .digest('hex')
    );
  }
}
