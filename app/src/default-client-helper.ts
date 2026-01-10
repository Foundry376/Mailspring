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
    // On Windows 11 21H2+ (with April 2023 update), we can deep link directly to Mailspring's
    // default app settings page. On older Windows versions, this falls back to the main
    // Default Apps page, which is still better than opening a web browser.
    shell.openExternal('ms-settings:defaultapps?registeredAppUser=Mailspring');
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
            buttons: [localized('Open Settings'), localized('Cancel')],
            defaultId: 0,
            message: localized(
              'Visit Windows Settings to finish making Mailspring your mail client'
            ),
            detail: localized(
              "Click 'Open Settings' to open Windows Settings where you can set Mailspring as your default email app."
            ),
          });
          if (response === 0) {
            // On Windows 11 21H2+ (with April 2023 update), this deep links directly to
            // Mailspring's default app settings. On older versions, falls back to Default Apps.
            shell.openExternal('ms-settings:defaultapps?registeredAppUser=Mailspring');
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

  isRegisteredForURLScheme(scheme: string, callback: (registered: boolean) => void) {
    if (!callback) {
      throw new Error('isRegisteredForURLScheme is async, provide a callback');
    }
    return callback(require('@electron/remote').app.isDefaultProtocolClient(scheme));
  }

  resetURLScheme(scheme: string, callback = (error?: Error) => {}) {
    return callback(require('@electron/remote').app.removeAsDefaultProtocolClient(scheme));
  }

  registerForURLScheme(scheme: string, callback = (error?: Error) => {}) {
    return callback(require('@electron/remote').app.setAsDefaultProtocolClient(scheme));
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
