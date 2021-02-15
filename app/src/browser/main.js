/* eslint dot-notation: 0 */
/* eslint global-require: 0 */
global.shellStartTime = Date.now();
const util = require('util');

// TODO: Remove when upgrading to Electron 4
const fs = require('fs');
fs.statSyncNoException = function(...args) {
  try {
    return fs.statSync.apply(fs, args);
  } catch (e) {}
  return false;
};

console.inspect = function consoleInspect(val) {
  console.log(util.inspect(val, true, 7, true));
};

const app = require('electron').app;
const path = require('path');
const mkdirp = require('mkdirp');

if (typeof process.setFdLimit === 'function') {
  process.setFdLimit(1024);
}

const setupConfigDir = args => {
  let dirname = 'Mailspring';
  if (args.devMode) {
    dirname = 'Mailspring-dev';
  }
  if (args.specMode) {
    dirname = 'Mailspring-spec';
  }
  let configDirPath = path.join(app.getPath('appData'), dirname);
  if (process.platform === 'linux' && process.env.SNAP) {
    // for linux snap, use the sandbox directory that is persisted between snap revisions
    configDirPath = process.env.SNAP_USER_COMMON;
  }

  // crete the directory
  mkdirp.sync(configDirPath);

  // tell Electron to use this folder for local storage, etc. as well
  app.setPath('userData', configDirPath);

  return configDirPath;
};

const setupCompileCache = configDirPath => {
  const compileCache = require('../compile-cache');
  return compileCache.setHomeDirectory(configDirPath);
};

const setupErrorLogger = (args = {}) => {
  const ErrorLogger = require('../error-logger');
  const errorLogger = new ErrorLogger({
    inSpecMode: args.specMode,
    inDevMode: args.devMode,
    resourcePath: args.resourcePath,
  });
  process.on('uncaughtException', errorLogger.reportError);
  process.on('unhandledRejection', errorLogger.reportError);
  return errorLogger;
};

const declareOptions = argv => {
  const optimist = require('optimist');
  const options = optimist(argv);
  options.usage(
    `Mailspring\n\nUsage: mailspring [options] [recipient] [attachment]\n\nRun Mailspring: The open source extensible email client\n\n\`mailspring mailto:johndoe@example.com\` to compose an e-mail to johndoe@example.com.\n\`mailspring ./attachment.txt\` to compose an e-mail with a text file attached.\n\`mailspring --dev\` to start the client in dev mode.\n\`mailspring --test\` to run unit tests.`
  );
  options
    .alias('d', 'dev')
    .boolean('d')
    .describe('d', 'Run in development mode.');
  options
    .alias('t', 'test')
    .boolean('t')
    .describe('t', 'Run the specified specs and exit with error code on failures.');
  options
    .boolean('safe')
    .describe(
      'safe',
      'Do not load packages from the settings `packages` or `dev/packages` folders.'
    );
  options
    .alias('h', 'help')
    .boolean('h')
    .describe('h', 'Print this usage message.');
  options
    .alias('l', 'log-file')
    .string('l')
    .describe('l', 'Log all test output to file.');
  options
    .alias('c', 'config-dir-path')
    .string('c')
    .describe('c', 'Override the path to the Mailspring configuration directory');
  options
    .alias('s', 'spec-directory')
    .string('s')
    .describe('s', 'Override the directory from which to run package specs');
  options
    .alias('f', 'spec-file-pattern')
    .string('f')
    .describe(
      'f',
      'Override the default file regex to determine which tests should run (defaults to "-spec.(js|jsx|es6|es)$" )'
    );
  options
    .alias('v', 'version')
    .boolean('v')
    .describe('v', 'Print the version.');
  options
    .alias('b', 'background')
    .boolean('b')
    .describe('b', 'Start Mailspring in the background');
  return options;
};

const parseCommandLine = argv => {
  const pkg = require('../../package.json');
  const version = `${pkg.version}-${pkg.commitHash}`;

  const options = declareOptions(argv.slice(1));
  const args = options.argv;

  if (args.help) {
    process.stdout.write(options.help());
    process.exit(0);
  }
  if (args.version) {
    process.stdout.write(`${version}\n`);
    process.exit(0);
  }
  const devMode = args['dev'] || args['test'];
  const logFile = args['log-file'];
  const specMode = args['test'];
  const jUnitXmlPath = args['junit-xml'];
  const safeMode = args['safe'];
  const background = args['background'];
  const configDirPath = args['config-dir-path'];
  const specDirectory = args['spec-directory'];
  const specFilePattern = args['spec-file-pattern'];
  const showSpecsInWindow = specMode === 'window';
  const resourcePath = path.normalize(path.resolve(path.dirname(path.dirname(__dirname))));
  const urlsToOpen = [];
  const pathsToOpen = [];

  // On Windows and Linux, mailto and file opens are passed in argv. Go through
  // the items and pluck out things that look like mailto:, mailspring:, file paths
  let ignoreNext = false;
  // args._ is all of the non-hyphenated options.
  for (const arg of args._) {
    if (ignoreNext) {
      ignoreNext = false;
      continue;
    }
    if (arg.includes('executed-from') || arg.includes('squirrel')) {
      ignoreNext = true;
      continue;
    }
    // Skip the argument if it's part of the main electron invocation.
    if (path.resolve(arg) === resourcePath) {
      continue;
    }
    if (arg.startsWith('mailto:') || arg.startsWith('mailspring:')) {
      urlsToOpen.push(arg);
    } else if (arg[0] !== '-' && /[/|\\]/.test(arg)) {
      pathsToOpen.push(arg);
    }
  }

  if (args['path-environment']) {
    process.env.PATH = args['path-environment'];
  }

  return {
    version,
    devMode,
    background,
    logFile,
    specMode,
    jUnitXmlPath,
    safeMode,
    configDirPath,
    specDirectory,
    specFilePattern,
    showSpecsInWindow,
    resourcePath,
    urlsToOpen,
    pathsToOpen,
  };
};

/*
 * "Squirrel will spawn your app with command line flags on first run, updates,]
 * and uninstalls."
 *
 * Read: https://github.com/electron-archive/grunt-electron-installer#handling-squirrel-events
 * Read: https://github.com/electron/electron/blob/master/docs/api/auto-updater.md#windows
 */
const handleStartupEventWithSquirrel = () => {
  if (process.platform !== 'win32') {
    return false;
  }
  const options = {
    allowEscalation: false,
    registerDefaultIfPossible: false,
  };

  const WindowsUpdater = require('./windows-updater');
  const squirrelCommand = process.argv[1];

  switch (squirrelCommand) {
    case '--squirrel-install':
      WindowsUpdater.createRegistryEntries(options, () =>
        WindowsUpdater.createShortcuts(() =>
          WindowsUpdater.installVisualElementsXML(() => app.quit())
        )
      );
      return true;
    case '--squirrel-updated':
      WindowsUpdater.restartMailspring(app);
      return true;
    case '--squirrel-uninstall':
      WindowsUpdater.removeShortcuts(() => app.quit());
      return true;
    case '--squirrel-obsolete':
      app.quit();
      return true;
    default:
      return false;
  }
};

const start = () => {
  app.setAppUserModelId('com.squirrel.mailspring.mailspring');
  if (handleStartupEventWithSquirrel()) {
    return;
  }

  const options = parseCommandLine(process.argv);
  global.errorLogger = setupErrorLogger(options);
  const configDirPath = setupConfigDir(options);
  options.configDirPath = configDirPath;

  if (!options.devMode) {
    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
      console.log('Exiting because another instance of the app is already running.');
      app.exit(1);
      return;
    }

    app.on('second-instance', (event, commandLine, workingDirectory) => {
      const otherOpts = parseCommandLine(commandLine);
      global.application.handleLaunchOptions(otherOpts);
    });
  }

  setupCompileCache(configDirPath);

  const onOpenFileBeforeReady = (event, file) => {
    event.preventDefault();
    options.pathsToOpen.push(file);
  };

  const onOpenUrlBeforeReady = (event, url) => {
    event.preventDefault();
    options.urlsToOpen.push(url);
  };

  app.on('open-url', onOpenUrlBeforeReady);
  app.on('open-file', onOpenFileBeforeReady);
  app.on('ready', () => {
    app.removeListener('open-file', onOpenFileBeforeReady);
    app.removeListener('open-url', onOpenUrlBeforeReady);

    // Block remote JS execution in a second way in case our <meta> tag approach
    // is compromised somehow https://www.electronjs.org/docs/tutorial/security
    // This CSP string should match the one in app/static/index.html
    require('electron').session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (details.url.startsWith('devtools://')) {
        return callback(details);
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src * mailspring:; script-src 'self' 'unsafe-inline' chrome-extension://react-developer-tools; style-src * 'unsafe-inline' mailspring:; img-src * data: mailspring: file:;",
          ],
        },
      });
    });

    // eslint-disable-next-line
    const Application = require(path.join(options.resourcePath, 'src', 'browser', 'application'))
      .default;
    global.application = new Application();
    global.application.start(options);

    if (!options.specMode) {
      console.log(`App load time: ${Date.now() - global.shellStartTime}ms`);
    }
  });
};

start();
