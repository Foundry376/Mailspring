import fs from 'fs';
import { exec } from 'child_process';
import { shell } from 'electron';
import { localized } from './intl';

const bundleIdentifier = 'com.mailspring.mailspring';

interface DCH {
  available(): boolean;
  isRegisteredForURLScheme(scheme: string, callback: (registered: boolean | Error) => void): void;
  resetURLScheme(scheme, callback: (error?: Error) => void): void;
  registerForURLScheme(scheme: string, callback: (error?: Error) => void): void;
}

export class DefaultClientHelperWindows implements DCH {
  available() {
    return true;
  }

  isRegisteredForURLScheme(scheme: string, callback: (registered: boolean | Error) => void) {
    if (!callback) {
      throw new Error('isRegisteredForURLScheme is async, provide a callback');
    }
    let output = '';
    exec(
      `reg.exe query HKCU\\SOFTWARE\\Microsoft\\Windows\\Roaming\\OpenWith\\UrlAssociations\\${scheme}\\UserChoice`,
      (err1, stdout1) => {
        output += stdout1.toString();
        exec(
          `reg.exe query HKCU\\SOFTWARE\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${scheme}\\UserChoice`,
          (err2, stdout2) => {
            output += stdout2.toString();
            if (err1 || err2) {
              callback(err1 || err2);
              return;
            }
            callback(output.includes('Mailspring'));
          }
        );
      }
    );
  }

  async resetURLScheme() {
    const { response } = await require('@electron/remote').dialog.showMessageBox({
      type: 'info',
      buttons: [localized('Learn More')],
      message: localized('Visit Windows Settings to change your default mail client'),
      detail: localized(
        "You'll find Mailspring, along with other options, listed in Default Apps > Mail."
      ),
    });

    if (response === 0) {
      shell.openExternal(
        'http://support.getmailspring.com/hc/en-us/articles/115001881412-Choose-Mailspring-as-the-default-mail-client-on-Windows'
      );
    }
  }

  registerForURLScheme(scheme: string, callback = (error?: Error) => {}) {
    // Ensure that our registry entires are present
    const WindowsUpdater = require('@electron/remote').require('./windows-updater');
    WindowsUpdater.createRegistryEntries(
      {
        allowEscalation: true,
        registerDefaultIfPossible: true,
      },
      async (err, didMakeDefault) => {
        if (err) {
          await require('@electron/remote').dialog.showMessageBox({
            type: 'error',
            buttons: [localized('OK')],
            message: localized('An error has occurred'),
            detail: err.message,
          });
          return;
        }

        if (!didMakeDefault) {
          const { response } = await require('@electron/remote').dialog.showMessageBox({
            type: 'info',
            buttons: [localized('Learn More')],
            defaultId: 1,
            message: localized(
              'Visit Windows Settings to finish making Mailspring your mail client'
            ),
            detail: localized("Click 'Learn More' to view instructions in our knowledge base."),
          });
          if (response === 0) {
            shell.openExternal(
              'http://support.getmailspring.com/hc/en-us/articles/115001881412-Choose-Mailspring-as-the-default-mail-client-on-Windows'
            );
          }
        }
        callback(null);
      }
    );
  }
}

export class DefaultClientHelperLinux implements DCH {
  available() {
    return !process.env.SNAP;
  }

  isRegisteredForURLScheme(scheme: string, callback: (registered: boolean | Error) => void) {
    if (!callback) {
      throw new Error('isRegisteredForURLScheme is async, provide a callback');
    }
    exec(`xdg-mime query default x-scheme-handler/${scheme}`, (err, stdout) =>
      err ? callback(err) : callback(stdout.trim() === 'Mailspring.desktop')
    );
  }

  resetURLScheme(scheme: string, callback = (error?: Error) => {}) {
    exec(`xdg-mime default thunderbird.desktop x-scheme-handler/${scheme}`, err =>
      err ? callback(err) : callback(null)
    );
  }
  registerForURLScheme(scheme: string, callback = (error?: Error) => {}) {
    exec(`xdg-mime default Mailspring.desktop x-scheme-handler/${scheme}`, err =>
      err ? callback(err) : callback(null)
    );
  }
}

export class DefaultClientHelperMac implements DCH {
  secure = false;

  available() {
    return true;
  }

  getLaunchServicesPlistPath(callback: (plist: string) => void) {
    const secure = `${process.env.HOME}/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist`;
    const insecure = `${process.env.HOME}/Library/Preferences/com.apple.LaunchServices.plist`;

    fs.exists(secure, exists => (exists ? callback(secure) : callback(insecure)));
  }

  readDefaults(callback = (result: Error | any, json?: any) => {}) {
    this.getLaunchServicesPlistPath(plistPath => {
      const tmpPath = `${plistPath}.${Math.random()}`;
      exec(`plutil -convert json "${plistPath}" -o "${tmpPath}"`, err => {
        if (err) {
          callback(err);
          return;
        }
        fs.readFile(tmpPath, (readErr, data) => {
          if (readErr) {
            callback(readErr);
            return;
          }
          try {
            const json = JSON.parse(data.toString());
            callback(json.LSHandlers, json);
            fs.unlink(tmpPath, () => {});
          } catch (e) {
            callback(e);
          }
        });
      });
    });
  }

  writeDefaults(defaults, callback = (error?: Error) => {}) {
    this.getLaunchServicesPlistPath(plistPath => {
      const tmpPath = `${plistPath}.${Math.random()}`;
      exec(`plutil -convert json "${plistPath}" -o "${tmpPath}"`, err => {
        if (err) {
          callback(err);
          return;
        }
        try {
          let data = fs.readFileSync(tmpPath).toString();
          data = JSON.parse(data);
          (data as any).LSHandlers = defaults;
          data = JSON.stringify(data);
          fs.writeFileSync(tmpPath, data);
        } catch (e) {
          callback(e);
          return;
        }
        exec(`plutil -convert binary1 "${tmpPath}" -o "${plistPath}"`, () => {
          fs.unlink(tmpPath, () => {});
          exec(
            '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user',
            registerErr => {
              callback(registerErr);
            }
          );
        });
      });
    });
  }

  isRegisteredForURLScheme(scheme: string, callback: (registered: boolean) => void) {
    if (!callback) {
      throw new Error('isRegisteredForURLScheme is async, provide a callback');
    }
    this.readDefaults(defaults => {
      for (const def of defaults) {
        if (def.LSHandlerURLScheme === scheme) {
          callback(def.LSHandlerRoleAll === bundleIdentifier);
          return;
        }
      }
      callback(false);
    });
  }

  resetURLScheme(scheme: string, callback = (error?: Error) => {}) {
    this.readDefaults(defaults => {
      // Remove anything already registered for the scheme
      for (let ii = defaults.length - 1; ii >= 0; ii--) {
        if (defaults[ii].LSHandlerURLScheme === scheme) {
          defaults.splice(ii, 1);
        }
      }
      this.writeDefaults(defaults, callback);
    });
  }

  registerForURLScheme(scheme: string, callback = (error?: Error) => {}) {
    this.readDefaults(defaults => {
      // Remove anything already registered for the scheme
      for (let ii = defaults.length - 1; ii >= 0; ii--) {
        if (defaults[ii].LSHandlerURLScheme === scheme) {
          defaults.splice(ii, 1);
        }
      }

      // Add our scheme default
      defaults.push({
        LSHandlerURLScheme: scheme,
        LSHandlerRoleAll: bundleIdentifier,
      });

      this.writeDefaults(defaults, callback);
    });
  }
}

let Default:
  | typeof DefaultClientHelperMac
  | typeof DefaultClientHelperLinux
  | typeof DefaultClientHelperWindows = null;

if (process.platform === 'darwin') {
  Default = DefaultClientHelperMac;
} else if (process.platform === 'win32') {
  Default = DefaultClientHelperWindows;
} else {
  Default = DefaultClientHelperLinux;
}
export const DefaultClientHelper = Default;
