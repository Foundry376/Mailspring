import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import ws from 'windows-shortcuts';
import { localized } from './intl';

class SystemStartServiceBase {
  checkAvailability(): Promise<boolean> {
    return Promise.resolve(false);
  }

  doesLaunchOnSystemStart() {
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
    return new Promise<boolean>(resolve => {
      fs.access(this._launcherPath(), fs.constants.R_OK | fs.constants.W_OK, err => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  doesLaunchOnSystemStart() {
    return new Promise(resolve => {
      fs.access(this._plistPath(), fs.constants.R_OK | fs.constants.W_OK, err => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  configureToLaunchOnSystemStart() {
    fs.writeFile(this._plistPath(), JSON.stringify(this._launchdPlist()), err => {
      if (err) {
        this._displayError(err);
      } else {
        exec(`plutil -convert xml1 ${this._plistPath()}`);
      }
    });
  }

  dontLaunchOnSystemStart() {
    fs.unlink(this._plistPath(), err => {
      if (err) {
        this._displayError(err);
      }
    });
  }

  _displayError(err: Error) {
    AppEnv.showErrorDialog(
      localized(
        'Mailspring was unable to create or delete the LaunchAgent file at %@.',
        this._plistPath()
      ) + `\n\n${err.toString()}`
    );
  }

  _launcherPath() {
    return path.join('/', 'Applications', 'Mailspring.app', 'Contents', 'MacOS', 'Mailspring');
  }

  _plistPath() {
    return path.join(process.env.HOME, 'Library', 'LaunchAgents', 'com.mailspring.plist');
  }

  _launchdPlist() {
    return {
      Label: 'com.mailspring.mailspring',
      Program: this._launcherPath(),
      ProgramArguments: ['--background'],
      RunAtLoad: true,
    };
  }
}

class SystemStartServiceWin32 extends SystemStartServiceBase {
  checkAvailability() {
    return new Promise<boolean>(resolve => {
      fs.access(this._launcherPath(), fs.constants.R_OK | fs.constants.W_OK, err => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  doesLaunchOnSystemStart() {
    return new Promise(resolve => {
      fs.access(this._shortcutPath(), fs.constants.R_OK | fs.constants.W_OK, err => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  configureToLaunchOnSystemStart() {
    ws.create(
      this._shortcutPath(),
      {
        target: this._launcherPath(),
        args: '--processStart=mailspring.exe --process-start-args=--background',
        runStyle: ws.MIN,
        desc: 'An extensible, open-source mail client built on the modern web.',
      },
      err => {
        if (err) AppEnv.reportError(err);
      }
    );
  }

  dontLaunchOnSystemStart() {
    return fs.unlink(this._shortcutPath(), () => {});
  }

  _launcherPath() {
    return path.join(process.env.LOCALAPPDATA, 'mailspring', 'Update.exe');
  }

  _shortcutPath() {
    return path.join(
      process.env.APPDATA,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
      'Mailspring.lnk'
    );
  }
}

class SystemStartServiceLinux extends SystemStartServiceBase {
  checkAvailability() {
    return new Promise<boolean>(resolve => {
      fs.access(this._launcherPath(), fs.constants.R_OK, err => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  doesLaunchOnSystemStart() {
    return new Promise(resolve => {
      fs.access(this._shortcutPath(), fs.constants.R_OK | fs.constants.W_OK, err => {
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
