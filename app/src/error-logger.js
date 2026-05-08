var ErrorLogger, _, app;

let ipcRenderer = null;
if (process.type === 'renderer') {
  ipcRenderer = require('electron').ipcRenderer;
  app = require('@electron/remote').app;
} else {
  app = require('electron').app;
}

var appVersion = app.getVersion();
var SentryErrorReporter = require('./error-logger-extensions/sentry-error-reporter');

// A globally available ErrorLogger that can report errors to various
// sources and enhance error functionality.
//
// This runs in both the backend browser process and each and every
// renderer process.
//
// This is available as `global.errorLogger` in the backend browser
// process.
//
// It is available at `AppEnv.errorLogger` in each renderer process.
// You should almost always use `AppEnv.reportError` in the renderer
// processes instead of manually accessing the `errorLogger`
//
// The errorLogger will report errors to a log file as well as to 3rd
// party reporting services if enabled.
module.exports = ErrorLogger = (function () {
  function ErrorLogger(args) {
    this.reportError = this.reportError.bind(this);
    this.inSpecMode = args.inSpecMode;
    this.inDevMode = args.inDevMode;
    this.resourcePath = args.resourcePath;

    this._startCrashReporter();

    this._extendErrorObject();

    this._extendNativeConsole();

    this.extensions = [
      new SentryErrorReporter({
        inSpecMode: args.inSpecMode,
        inDevMode: args.inDevMode,
        resourcePath: args.resourcePath,
      }),
    ];

    if (this.inSpecMode) {
      return;
    }
  }

  /////////////////////////////////////////////////////////////////////
  /////////////////////////// PUBLIC METHODS //////////////////////////
  /////////////////////////////////////////////////////////////////////

  ErrorLogger.prototype.reportError = function (error, extra = {}) {
    if (this.inSpecMode) {
      return;
    }
    // Without a message and a stack, an error logged to Sentry shows up as
    // "Unknown error" with only the IPC handler frame, which is unactionable.
    // Wrap such inputs in a real Error here so we capture the call site as
    // the stack and describe the original input in the message.
    var hasMessage =
      error && typeof error.message === 'string' && error.message.length > 0;
    var hasStack = error && typeof error.stack === 'string' && error.stack.length > 0;
    if (!hasMessage && !hasStack) {
      var description;
      try {
        if (error === undefined) description = 'undefined';
        else if (error === null) description = 'null';
        else if (typeof error === 'object') description = JSON.stringify(error);
        else description = String(error);
      } catch (e) {
        description = Object.prototype.toString.call(error);
      }
      var wrapped = new Error('Empty error reported (' + description + ')');
      if (error && typeof error === 'object') {
        // Copy any other useful fields from the original, but never let an
        // empty `message`/`stack` on the input clobber the wrap's real values
        // — that would defeat the whole purpose of wrapping.
        try {
          var keys = Object.getOwnPropertyNames(error);
          for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (key === 'message' || key === 'stack') continue;
            wrapped[key] = error[key];
          }
        } catch (e) {
          // ignore non-assignable inputs
        }
      }
      error = wrapped;
    }
    if (process.type === 'renderer') {
      var errorJSON = '{}';
      try {
        errorJSON = JSON.stringify(error);
      } catch (err) {
        var recoveredError = new Error();
        recoveredError.stack = error.stack;
        recoveredError.message = `Recovered Error: ${error.message}`;
        errorJSON = JSON.stringify(recoveredError);
      }

      var extraJSON;
      try {
        extraJSON = JSON.stringify(extra);
      } catch (err) {
        extraJSON = '{}';
      }

      /**
       * We synchronously send all errors to the backend main process.
       *
       * This is important because errors can frequently happen right
       * before a renderer window is closing. Since error reporting hits
       * APIs and is asynchronous it's possible for the window to be
       * destroyed before the report makes it.
       *
       * This is a rare use of `sendSync` to ensure the command has made
       * it before the window closes.
       */
      ipcRenderer.sendSync('report-error', { errorJSON: errorJSON, extra: extraJSON });
    } else {
      this._notifyExtensions('reportError', error, extra);
    }
    console.error(error, extra);
  };

  /////////////////////////////////////////////////////////////////////
  ////////////////////////// PRIVATE METHODS //////////////////////////
  /////////////////////////////////////////////////////////////////////

  ErrorLogger.prototype._startCrashReporter = function (args) {
    if (process.type === 'renderer') {
      return;
    }
    require('electron').crashReporter.start({
      productName: 'Mailspring',
      companyName: 'Mailspring',
      submitURL: `https://id.getmailspring.com/report-crash?ver=${appVersion}&platform=${process.platform}`,
      uploadToServer: true,
      autoSubmit: true,
      extra: {
        ver: appVersion,
        platform: process.platform,
      },
    });
  };

  ErrorLogger.prototype._extendNativeConsole = function (args) {
    console.debug = this._consoleDebug.bind(this);
  };

  // globally define Error.toJSON. This allows us to pass errors via IPC
  // and through the Action Bridge. Note:they are not re-inflated into
  // Error objects automatically.
  ErrorLogger.prototype._extendErrorObject = function (args) {
    Object.defineProperty(Error.prototype, 'toJSON', {
      value: function () {
        var alt = {};

        Object.getOwnPropertyNames(this).forEach(function (key) {
          alt[key] = this[key];
        }, this);

        return alt;
      },
      configurable: true,
    });
  };

  ErrorLogger.prototype._notifyExtensions = function () {
    var command, args;
    command = arguments[0];
    args = 2 <= arguments.length ? Array.prototype.slice.call(arguments, 1) : [];
    for (var i = 0; i < this.extensions.length; i++) {
      const extension = this.extensions[i];
      extension[command].apply(extension, args);
    }
  };

  // Create a new console.debug option, which takes `true` (print)
  // or `false`, don't print in console as the first parameter.
  // This makes it easy for developers to turn on and off
  // "verbose console" mode.
  ErrorLogger.prototype._consoleDebug = function () {
    var args = [];
    var showIt = arguments[0];
    for (var ii = 1; ii < arguments.length; ii++) {
      args.push(arguments[ii]);
    }
    if (this.inDevMode === true && showIt === true) {
      console.log.apply(console, args);
    }
  };

  return ErrorLogger;
})();
