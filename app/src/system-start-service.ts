import path from 'path';
import fs from 'fs';
import os from 'os';

class SystemStartServiceBase {
  checkAvailability(): Promise<boolean> {
    return Promise.resolve(false);
  }

  doesLaunchOnSystemStart(): Promise<boolean> {
    throw new Error('doesLaunchOnSystemStart is not available');
  }

  configureToLaunchOnSystemStart() {
    throw new Error('configureToLaunchOnSystemStart is not available');
  }

  dontLaunchOnSystemStart() {
    throw new Error('dontLaunchOnSystemStart is not available');
  }
}

class SystemStartServiceDarwin extends SystemStartServiceBase {
  checkAvailability() {
    return Promise.resolve(true);
  }

  doesLaunchOnSystemStart() {
    const app = require('@electron/remote').app;
    const settings = app.getLoginItemSettings();
    return Promise.resolve(settings.openAtLogin as boolean);
  }

  configureToLaunchOnSystemStart() {
    const app = require('@electron/remote').app;
    app.setLoginItemSettings({ openAtLogin: true });
    this._cleanupLegacyPlist();
  }

  dontLaunchOnSystemStart() {
    const app = require('@electron/remote').app;
    app.setLoginItemSettings({ openAtLogin: false });
    this._cleanupLegacyPlist();
  }

  _cleanupLegacyPlist() {
    const plistPath = path.join(
      process.env.HOME,
      'Library',
      'LaunchAgents',
      'com.mailspring.plist'
    );
    fs.unlink(plistPath, () => {});
  }
}

class SystemStartServiceWin32 extends SystemStartServiceBase {
  checkAvailability() {
    return new Promise<boolean>((resolve) => {
      fs.access(this._updateExePath(), fs.constants.R_OK, (err) => {
        resolve(!err);
      });
    });
  }

  doesLaunchOnSystemStart() {
    const app = require('@electron/remote').app;
    const settings = app.getLoginItemSettings({
      path: this._updateExePath(),
      args: this._loginArgs(),
      name: app.getName(),
    });
    return Promise.resolve(settings.openAtLogin as boolean);
  }

  configureToLaunchOnSystemStart() {
    const app = require('@electron/remote').app;
    app.setLoginItemSettings({
      openAtLogin: true,
      path: this._updateExePath(),
      args: this._loginArgs(),
      name: app.getName(),
    });
    this._cleanupLegacyShortcut();
  }

  dontLaunchOnSystemStart() {
    const app = require('@electron/remote').app;
    app.setLoginItemSettings({
      openAtLogin: false,
      path: this._updateExePath(),
      args: this._loginArgs(),
      name: app.getName(),
    });
    this._cleanupLegacyShortcut();
  }

  _updateExePath() {
    const appFolder = path.dirname(process.execPath);
    return path.resolve(appFolder, '..', 'Update.exe');
  }

  _loginArgs() {
    const exeName = path.basename(process.execPath);
    return ['--processStart', `"${exeName}"`, '--process-start-args', `"--background"`];
  }

  _cleanupLegacyShortcut() {
    const shortcutPath = path.join(
      process.env.APPDATA,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
      'Mailspring.lnk'
    );
    fs.unlink(shortcutPath, () => {});
  }
}

class SystemStartServiceLinux extends SystemStartServiceBase {
  checkAvailability() {
    return new Promise<boolean>((resolve) => {
      fs.access(this._launcherPath(), fs.constants.R_OK, (err) => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  doesLaunchOnSystemStart() {
    return new Promise<boolean>((resolve) => {
      fs.access(this._shortcutPath(), fs.constants.R_OK | fs.constants.W_OK, (err) => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  configureToLaunchOnSystemStart() {
    fs.readFile(this._launcherPath(), 'utf8', (error, data) => {
      // Append the --background flag before the Exec key
      const parsedData = data.replace('%U', '--background %U');

      fs.writeFile(this._shortcutPath(), parsedData, () => {});
    });
  }

  dontLaunchOnSystemStart() {
    return fs.unlink(this._shortcutPath(), () => {});
  }

  _launcherPath() {
    return path.join('/', 'usr', 'share', 'applications', 'Mailspring.desktop');
  }

  _shortcutPath() {
    const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(configDir, 'autostart', 'Mailspring.desktop');
  }
}

/* eslint import/no-mutable-exports: 0*/
let SystemStartService;
if (process.platform === 'darwin') {
  SystemStartService = SystemStartServiceDarwin;
} else if (process.platform === 'linux') {
  SystemStartService = SystemStartServiceLinux;
} else if (process.platform === 'win32') {
  SystemStartService = SystemStartServiceWin32;
} else {
  SystemStartService = SystemStartServiceBase;
}

export default SystemStartService;
