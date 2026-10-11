// Playwright's page.evaluate / locator.evaluate serialize functions and eval them
// in the page, so the hardening is skipped under the e2e harness.
if (!process.env.PLAYWRIGHT) {
  window.eval = global.eval = function () {
    throw new Error('Sorry, Mailspring does not support window.eval() for security reasons.');
  };
}

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

// Paints the stack into the window the user is already looking at, so a packaged build with
// no console still shows what went wrong. Deliberately uses no app modules: window setup has
// just failed, so anything it might require may be the thing that's broken.
function showSetupErrorInWindow(stack) {
  var heading = document.createElement('h1');
  heading.textContent = 'Mailspring failed to start.';
  heading.style.cssText = 'margin:0 0 12px;font:600 15px/1.4 system-ui,sans-serif;';

  // This window never loaded the app's menus, so there is no Edit > Copy and the platform
  // copy shortcut does nothing. The button is the only way out for a bug report.
  var button = document.createElement('button');
  button.textContent = 'Copy to Clipboard';
  button.style.cssText = 'margin:0 0 16px;padding:4px 12px;font:13px system-ui,sans-serif;';
  button.onclick = function () {
    require('@electron/remote').clipboard.writeText(stack);
    button.textContent = 'Copied';
  };

  var pre = document.createElement('pre');
  pre.textContent = stack;
  pre.style.cssText =
    'margin:0;font:12px/1.5 monospace;white-space:pre-wrap;' +
    '-webkit-user-select:text;user-select:text;';

  document.body.textContent = '';
  document.body.style.cssText = 'margin:0;padding:20px;color:#333;background:#fff;';
  document.body.appendChild(heading);
  document.body.appendChild(button);
  document.body.appendChild(pre);
}

function handleSetupError(error) {
  var currentWindow = require('@electron/remote').getCurrentWindow();
  currentWindow.setSize(800, 600);
  currentWindow.center();
  currentWindow.show();
  var stack = (error && error.stack) || String(error);
  console.error(stack);
  if (require('../src/developer-tools').developerToolsAvailable()) {
    currentWindow.openDevTools();
  } else {
    showSetupErrorInWindow(stack);
  }
}

function copyEnvFromMainProcess() {
  const newEnv = Object.assign(
    {},
    process.env,
    JSON.parse(JSON.stringify(require('@electron/remote').process.env))
  );
  process.env = newEnv;
}

function setupWindow(loadSettings) {
  if (process.platform === 'linux') {
    // This will properly inherit process.env from the main process, which it doesn't
    // do by default on Linux. See: https://github.com/atom/electron/issues/3306
    copyEnvFromMainProcess();
  }

  if (loadSettings.devMode) {
    var CompileCache = require('../src/compile-cache-ts');
    CompileCache.setHomeDirectory(loadSettings.configDirPath);
  } else {
    require('../src/compile-cache-ts-unsupported');
  }

  require(loadSettings.bootstrapScript);
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
  } catch (error) {
    handleSetupError(error);
  }
};
