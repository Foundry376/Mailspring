/*
 * "Squirrel will spawn your app with command line flags on first run, updates,]
 * and uninstalls."
 *
 * Read: https://github.com/electron-archive/grunt-electron-installer#handling-squirrel-events
 * Read: https://github.com/electron/electron/blob/master/docs/api/auto-updater.md#windows
 *
 * When Mailspring gets installed on a Windows machine it gets put in:
 * C:\Users\<USERNAME>\AppData\Local\Mailspring\app-x.x.x
 *
 * The `process.execPath` is:
 * C:\Users\<USERNAME>\AppData\Local\Mailspring\app-x.x.x\nylas.exe
 *
 * We manually copy everything in build/resources/win into a 'resources' folder
 * located inside the main app directory. See runCopyPlatformSpecificResources
 * in package-task.js
 *
 * This means `__dirname` should be:
 * C:\Users\<USERNAME>\AppData\Local\Mailspring\app-x.x.x\resources
 *
 * We also expect Squirrel Windows to have a file called `nylas.exe` at:
 * C:\Users\<USERNAME>\AppData\Local\Mailspring\nylas.exe
 */
const ChildProcess = require('child_process');
const fs = require('fs-plus');
const path = require('path');
const os = require('os');
const { shell } = require('electron');

// C:\Users\<USERNAME>\AppData\Local\Mailspring\app-x.x.x
const appFolder = path.resolve(process.execPath, '..');

// C:\Users\<USERNAME>\AppData\Local\Mailspring\
const rootAppDataFolder = path.resolve(appFolder, '..');

// C:\Users\<USERNAME>\AppData\Local\Mailspring\Update.exe
const updateDotExe = path.join(rootAppDataFolder, 'Update.exe');

// "mailspring.exe"
const exeName = path.basename(process.execPath);

// Spawn a command and invoke the callback when it completes with an error
// and the output from standard out.
function spawn(command, args, callback, options = {}) {
  let stdout = '';
  let spawnedProcess = null;

  try {
    spawnedProcess = ChildProcess.spawn(command, args, options);
  } catch (error) {
    // Spawn can throw an error
    setTimeout(() => callback && callback(error, stdout), 0);
    return;
  }

  spawnedProcess.stdout.on('data', data => {
    stdout += data;
  });

  let error = null;
  spawnedProcess.on('error', processError => {
    error = error || processError;
  });

  spawnedProcess.on('close', (code, signal) => {
    if (code !== 0) {
      error = error || new Error(`Command failed: ${signal || code}`);
    }
    if (error) {
      error.code = error.code || code;
      error.stdout = error.stdout || stdout;
    }
    if (callback) {
      callback(error, stdout);
    }
  });
}

// Spawn a command in detached mode without waiting for completion.
// This is used for Squirrel hooks where we need to exit quickly to avoid
// hitting Squirrel's 15-second timeout.
// See: https://github.com/Squirrel/Squirrel.Windows/issues/501
function spawnDetached(command, args) {
  try {
    const child = ChildProcess.spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (error) {
    // Ignore spawn errors - we're exiting anyway
  }
}

// Spawn the Update.exe with the given arguments and invoke the callback when
// the command completes.
function spawnUpdate(args, callback, options = {}) {
  spawn(updateDotExe, args, callback, options);
}

function createRegistryEntries({ allowEscalation, registerDefaultIfPossible }, callback) {
  const escapeBackticks = str => str.replace(/\\/g, '\\\\');

  const isWindows7 = os.release().startsWith('6.1');
  const requiresLocalMachine = isWindows7;

  // On Windows 7, we must write to LOCAL_MACHINE and need escalated privileges.
  // Don't do it at install time - wait for the user to ask Mailspring to be the default.
  if (requiresLocalMachine && !allowEscalation) {
    callback();
    return;
  }

  let regPath = 'reg.exe';
  if (process.env.SystemRoot) {
    regPath = path.join(process.env.SystemRoot, 'System32', 'reg.exe');
  }

  let spawnPath = regPath;
  let spawnArgs = [];
  if (requiresLocalMachine) {
    spawnPath = path.join(appFolder, 'resources', 'elevate.cmd');
    spawnArgs = [regPath];
  }

  fs.readFile(
    path.join(appFolder, 'resources', 'mailspring-mailto-registration.reg'),
    (err, data) => {
      if (err || !data) {
        callback(err);
        return;
      }
      const importTemplate = data.toString();
      let importContents = importTemplate.replace(
        /{{PATH_TO_ROOT_FOLDER}}/g,
        escapeBackticks(rootAppDataFolder)
      );
      importContents = importContents.replace(
        /{{PATH_TO_APP_FOLDER}}/g,
        escapeBackticks(appFolder)
      );
      if (requiresLocalMachine) {
        importContents = importContents.replace(/{{HKEY_ROOT}}/g, 'HKEY_LOCAL_MACHINE');
      } else {
        importContents = importContents.replace(/{{HKEY_ROOT}}/g, 'HKEY_CURRENT_USER');
      }

      const importTempPath = path.join(os.tmpdir(), `mailspring-reg-${Date.now()}.reg`);

      fs.writeFile(importTempPath, importContents, writeErr => {
        if (writeErr) {
          callback(writeErr);
          return;
        }

        spawn(
          spawnPath,
          spawnArgs.concat(['import', escapeBackticks(importTempPath)]),
          spawnErr => {
            if (isWindows7 && registerDefaultIfPossible) {
              const defaultReg = path.join(appFolder, 'resources', 'mailspring-mailto-default.reg');
              spawn(
                spawnPath,
                spawnArgs.concat(['import', escapeBackticks(defaultReg)]),
                spawnDefaultErr => {
                  callback(spawnDefaultErr, true);
                }
              );
            } else {
              callback(spawnErr, false);
            }
          }
        );
      });
    }
  );
}

exports.spawn = spawnUpdate;
exports.createRegistryEntries = createRegistryEntries;

// Is the Update.exe installed with Mailspring?
exports.existsSync = () => fs.existsSync(updateDotExe);

// Register the AppUserModelId with a display name so Windows notifications
// show "Mailspring" instead of "com.squirrel.mailspring.mailspring"
// Registry path: HKEY_CURRENT_USER\SOFTWARE\Classes\AppUserModelId\{AUMID}
function registerAppUserModelId(callback) {
  const aumid = 'com.squirrel.mailspring.mailspring';
  const displayName = 'Mailspring';
  const iconPath = path.join(appFolder, 'resources', 'mailspring.ico');

  let regPath = 'reg.exe';
  if (process.env.SystemRoot) {
    regPath = path.join(process.env.SystemRoot, 'System32', 'reg.exe');
  }

  const regKey = `HKEY_CURRENT_USER\\SOFTWARE\\Classes\\AppUserModelId\\${aumid}`;

  // Add the DisplayName value
  spawn(
    regPath,
    ['add', regKey, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', displayName, '/f'],
    err => {
      if (err) {
        console.warn('Failed to register AUMID DisplayName:', err);
      }
      // Also add IconUri if the icon exists
      if (fs.existsSync(iconPath)) {
        spawn(
          regPath,
          ['add', regKey, '/v', 'IconUri', '/t', 'REG_SZ', '/d', iconPath, '/f'],
          iconErr => {
            if (iconErr) {
              console.warn('Failed to register AUMID IconUri:', iconErr);
            }
            if (callback) callback(err || iconErr);
          }
        );
      } else {
        if (callback) callback(err);
      }
    }
  );
}

exports.registerAppUserModelId = registerAppUserModelId;

// Restart Mailspring using the version pointed to by the Mailspring.cmd shim
exports.restartMailspring = app => {
  app.once('will-quit', () => {
    spawnUpdate(['--processStart', exeName], () => {}, { detached: true });
  });
  app.quit();
};

// Handle --squirrel-install event with fast exit.
// Squirrel.Windows has a 15-second timeout for hooks. We spawn all necessary
// processes in detached mode and exit immediately to avoid timeout.
// See: https://github.com/Squirrel/Squirrel.Windows/issues/501
// See: https://github.com/Squirrel/Squirrel.Windows/issues/1145
exports.handleSquirrelInstall = app => {
  // Spawn Update.exe to create shortcuts (detached - won't block exit)
  spawnDetached(updateDotExe, [
    '--createShortcut',
    exeName,
    '--shortcut-locations',
    'Desktop,StartMenu',
  ]);

  // Copy visual elements files synchronously (fast)
  try {
    fs.copyFileSync(
      path.join(appFolder, 'resources', 'mailspring-75px.png'),
      path.join(rootAppDataFolder, 'mailspring-75px.png')
    );
    fs.copyFileSync(
      path.join(appFolder, 'resources', 'mailspring-150px.png'),
      path.join(rootAppDataFolder, 'mailspring-150px.png')
    );
    fs.copyFileSync(
      path.join(appFolder, 'resources', 'mailspring.VisualElementsManifest.xml'),
      path.join(rootAppDataFolder, 'mailspring.VisualElementsManifest.xml')
    );
  } catch (err) {
    // Ignore errors - visual elements are optional
  }

  // Create fallback shortcuts synchronously (fast)
  const startMenuPath = path.join(
    process.env.APPDATA,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Mailspring.lnk'
  );
  const desktopPath = path.join(
    process.env.USERPROFILE || process.env.HOME,
    'Desktop',
    'Mailspring.lnk'
  );
  const iconPath = path.join(appFolder, 'resources', 'mailspring.ico');

  const shortcutOptions = {
    target: updateDotExe,
    args: '--processStart mailspring.exe',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    iconIndex: 0,
    description: 'The best email app for people and teams at work',
    appUserModelId: 'com.squirrel.mailspring.mailspring',
  };

  try {
    if (!fs.existsSync(startMenuPath)) {
      shell.writeShortcutLink(startMenuPath, 'create', shortcutOptions);
    }
  } catch (err) {
    // Ignore - Squirrel's method might succeed
  }

  try {
    if (!fs.existsSync(desktopPath)) {
      shell.writeShortcutLink(desktopPath, 'create', shortcutOptions);
    }
  } catch (err) {
    // Ignore - Squirrel's method might succeed
  }

  // Spawn reg.exe to register AUMID (detached - won't block exit)
  const aumid = 'com.squirrel.mailspring.mailspring';
  const regKey = `HKEY_CURRENT_USER\\SOFTWARE\\Classes\\AppUserModelId\\${aumid}`;
  let regPath = 'reg.exe';
  if (process.env.SystemRoot) {
    regPath = path.join(process.env.SystemRoot, 'System32', 'reg.exe');
  }
  spawnDetached(regPath, [
    'add',
    regKey,
    '/v',
    'DisplayName',
    '/t',
    'REG_SZ',
    '/d',
    'Mailspring',
    '/f',
  ]);
  if (fs.existsSync(iconPath)) {
    spawnDetached(regPath, ['add', regKey, '/v', 'IconUri', '/t', 'REG_SZ', '/d', iconPath, '/f']);
  }

  // Registry entries for mailto: protocol are registered on first normal app launch
  // (via createRegistryEntries call in main.js startup). This ensures registration
  // completes even if the detached processes here don't finish before Squirrel's timeout.

  // Exit immediately - don't wait for spawned processes
  app.quit();
};

// Handle --squirrel-uninstall event with fast exit.
exports.handleSquirrelUninstall = app => {
  // Spawn Update.exe to remove shortcuts (detached - won't block exit)
  spawnDetached(updateDotExe, ['--removeShortcut', exeName]);

  // Try to remove fallback shortcuts synchronously
  const startMenuPath = path.join(
    process.env.APPDATA,
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Mailspring.lnk'
  );
  const desktopPath = path.join(
    process.env.USERPROFILE || process.env.HOME,
    'Desktop',
    'Mailspring.lnk'
  );

  try {
    if (fs.existsSync(startMenuPath)) {
      fs.unlinkSync(startMenuPath);
    }
  } catch (err) {
    // Ignore
  }

  try {
    if (fs.existsSync(desktopPath)) {
      fs.unlinkSync(desktopPath);
    }
  } catch (err) {
    // Ignore
  }

  // Exit immediately
  app.quit();
};
