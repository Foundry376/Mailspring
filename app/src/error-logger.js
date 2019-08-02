var ErrorLogger, _, app, remote;
const path = require('path');
let ipcRenderer = null;
if (process.type === 'renderer') {
  ipcRenderer = require('electron').ipcRenderer;
  remote = require('electron').remote;
  app = remote.app;
} else {
  app = require('electron').app;
}

var appVersion = app.getVersion();
var crashReporter = require('electron').crashReporter;
// var RavenErrorReporter = require('./error-logger-extensions/raven-error-reporter');
var EdisonErrorReporter = require('./error-logger-extensions/edison-error-reporter');
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
      new EdisonErrorReporter({
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
    if (!error) {
      error = { stack: '' };
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
    if (error.name === 'conflict' && error.status === 409) {
      console.warn(error, extra);
    } else {
      // console.error(error, extra);
    }
  };
  ErrorLogger.prototype.reportWarning = function (error, extra = {}) {
    if (this.inSpecMode) {
      return;
    }
    if (!error) {
      error = { stack: '' };
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
      ipcRenderer.sendSync('report-warning', { errorJSON: errorJSON, extra: extraJSON });
    } else {
      this._notifyExtensions('reportWarning', error, extra);
    }
    if (error.name === 'conflict' && error.status === 409) {
      console.warn(error, extra);
    } else {
      // console.warn(error, extra);
    }
  };

  /////////////////////////////////////////////////////////////////////
  ////////////////////////// PRIVATE METHODS //////////////////////////
  /////////////////////////////////////////////////////////////////////

  ErrorLogger.prototype._startCrashReporter = function (args) {
    const crashPath = path.join(this.resourcePath, 'crashReport');
    let serverURL = '';
    if(process.env.NODE_ENV !== 'production'){
      serverURL = `http://tiger:1127/post`;
    }else{
      serverURL = `https://cp.stag.easilydo.cc/api/log/`;
    }
    crashReporter.start({
      productName: 'EdisonMail',
      companyName: 'Edison Tech',
      submitURL: serverURL,
      uploadToServer: true,
      autoSubmit: true,
      crashesDirectory: crashPath,
      extra: {
        version: appVersion,
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
