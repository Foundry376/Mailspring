window.eval = global.eval = function () {
  throw new Error('Sorry, N1 does not support window.eval() for security reasons.');
};

var util = null;

console.inspect = function consoleInspect(val) {
  util = util || require('util');
  console.log(util.inspect(val, true, 7, true));
};

function setLoadTime(loadTime) {
  if (global.AppEnv) {
    global.AppEnv.loadTime = loadTime;
    if (AppEnv.inSpecMode()) return;
    console.log('Window load time: ' + global.AppEnv.getWindowLoadTime() + 'ms');
  }
}

function handleSetupError(error) {
  var currentWindow = require('electron').remote.getCurrentWindow();
  currentWindow.setSize(800, 600);
  currentWindow.center();
  currentWindow.show();
  currentWindow.openDevTools();
  console.error(error.stack || error);
}

function copyEnvFromMainProcess() {
  const remote = require('electron').remote; //eslint-disable-line
  const newEnv = Object.assign({}, process.env, JSON.parse(JSON.stringify(remote.process.env)));
  process.env = newEnv;
}

function setupWindow(loadSettings) {
  if (process.platform === 'linux') {
    // This will properly inherit process.env from the main process, which it doesn't
    // do by default on Linux. See: https://github.com/atom/electron/issues/3306
    copyEnvFromMainProcess();
  }

  var CompileCache = require('../src/compile-cache');
  CompileCache.setHomeDirectory(loadSettings.configDirPath);

  setupVmCompatibility();

  require(loadSettings.bootstrapScript);
}

function setupVmCompatibility() {
  var vm = require('vm');
  if (!vm.Script.createContext) {
    vm.Script.createContext = vm.createContext;
  }
}

window.onload = function () {
  try {
    var startTime = Date.now();

    // Skip "?loadSettings=".
    var rawLoadSettings = decodeURIComponent(window.location.search.substr(14));
    var loadSettings;
    try {
      loadSettings = JSON.parse(rawLoadSettings);
    } catch (error) {
      console.error('Failed to parse load settings: ' + rawLoadSettings);
      throw error;
    }

    // Normalize to make sure drive letter case is consistent on Windows
    var path = require('path');
    process.resourcesPath = path.normalize(process.resourcesPath);

    setupWindow(loadSettings);
    setLoadTime(Date.now() - startTime);
    if (process.env.MONKEY_SERVER) {
      const gremlins = require('./gremlins.min.js');
      const logForMonkey = require('electron-log');
      var horde = gremlins.createHorde();
      var customLogger = {
        log: console.log,
        info: logForMonkey.info,
        warn: logForMonkey.warn,
        error: logForMonkey.error,
      };
      horde.logger(customLogger);
      horde.unleash({ nb: 100 * 60 * 60 * 24 * 7 });
    }
  } catch (error) {
    handleSetupError(error);
  }
};
