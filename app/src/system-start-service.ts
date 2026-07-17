import path from 'path';
import fs from 'fs';
import pkg from './utils/package';
import { getFirstExistingPath, XDG_CONFIG_PATHS, XDG_DATA_PATHS } from './utils/xdg-paths';

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
    if (!process.env.HOME) {
      return;
    }
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
      fs.access(this._updateExePath(), fs.constants.R_OK, (err: NodeJS.ErrnoException | null) => {
        resolve(!err);
      });
    });
  }

  doesLaunchOnSystemStart() {
    const app = require('@electron/remote').app;
    const settings = app.getLoginItemSettings({
      path: this._updateExePath(),
      args: this._loginArgs(),
    });
    return Promise.resolve(settings.openAtLogin as boolean);
  }

  configureToLaunchOnSystemStart() {
    const app = require('@electron/remote').app;
    app.setLoginItemSettings({
      openAtLogin: true,
      path: this._updateExePath(),
      args: this._loginArgs(),
    });
  }

  dontLaunchOnSystemStart() {
    const app = require('@electron/remote').app;
    app.setLoginItemSettings({
      openAtLogin: false,
      path: this._updateExePath(),
      args: this._loginArgs(),
    });
  }

  _updateExePath() {
    const appFolder = path.dirname(process.execPath);
    return path.resolve(appFolder, '..', 'Update.exe');
  }

  _loginArgs() {
    const exeName = path.basename(process.execPath);
    return ['--processStart', `${exeName}`, '--process-start-args', `"--background"`];
  }
}

class SystemStartServiceLinux extends SystemStartServiceBase {
  async checkAvailability(): Promise<boolean> {
    return this._launcherPath() !== null;
  }

  async doesLaunchOnSystemStart(): Promise<boolean> {
    const shortcutPath = this._shortcutPath();
    try {
      await fs.promises.access(shortcutPath, fs.constants.R_OK);
      return true;
    } catch (err) {
      return false;
    }
  }

  configureToLaunchOnSystemStart() {
    (async () => {
      try {
        const launcherPath = this._launcherPath();
        if (!launcherPath) {
          throw new Error('Launcher path not found');
        }

        const data = await fs.promises.readFile(launcherPath, 'utf8');
        const parsedData = data.replace('%U', '--background %U');

        const shortcutPath = this._shortcutPath();
        await fs.promises.mkdir(path.dirname(shortcutPath), { recursive: true });
        await fs.promises.writeFile(shortcutPath, parsedData, 'utf8');
      } catch (error) {
        console.error('Error configuring to launch on system start:', error);
      }
    })();
  }

  dontLaunchOnSystemStart() {
    fs.unlink(this._shortcutPath(), () => {});
  }

  _launcherPath(): string | null {
    return getFirstExistingPath(XDG_DATA_PATHS, path.join('applications', pkg.desktopName));
  }

  _shortcutPath(): string {
    const configDir = XDG_CONFIG_PATHS[0];
    return path.join(configDir, 'autostart', pkg.desktopName);
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
