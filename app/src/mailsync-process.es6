/* eslint global-require: 0 */

/*
Warning! This file is imported from the main process as well as the renderer process
*/
import { spawn, exec } from 'child_process';
import { Readable } from 'stream';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import fs from 'fs';

let Utils = null;

export const LocalizedErrorStrings = {
  ErrorConnection: 'Connection Error - Unable to connect to the server / port you provided.',
  ErrorInvalidAccount:
    'This account is invalid or EdisonMail could not find the Inbox or All Mail folder. http://support.getmailspring.com/hc/en-us/articles/115001881912',
  ErrorTLSNotAvailable: 'TLS Not Available',
  ErrorParse: 'Parsing Error',
  ErrorCertificate:
    "Certificate Error - The mail server's security certificate is invalid and may pose a security" +
    " risk. If you trust the server, you can continue by checking 'Allowing Insecure SSL'.",
  ErrorAuthentication: 'Authentication Error - Check your username and password.',
  ErrorGmailIMAPNotEnabled: 'Gmail IMAP is not enabled. Visit Gmail settings to turn it on.',
  ErrorGmailExceededBandwidthLimit: 'Gmail bandwidth exceeded. Please try again later.',
  ErrorGmailTooManySimultaneousConnections:
    'There are too many active connections to your Gmail account. Please try again later.',
  ErrorMobileMeMoved: 'MobileMe has moved.',
  ErrorYahooUnavailable: 'Yahoo is unavailable.',
  ErrorNonExistantFolder: 'Sorry, this folder does not exist.',
  ErrorStartTLSNotAvailable: 'StartTLS is not available.',
  ErrorGmailApplicationSpecificPasswordRequired:
    'A Gmail application-specific password is required.',
  ErrorOutlookLoginViaWebBrowser: 'The Outlook server said you must sign in via a web browser.',
  ErrorNeedsConnectToWebmail: 'The server said you must sign in via your webmail.',
  ErrorNoValidServerFound: 'No valid server found.',
  ErrorAuthenticationRequired: 'Authentication required.',

  // sending related
  ErrorSendMessageNotAllowed: 'Sending is not enabled for this account.',
  ErrorSendMessageIllegalAttachment:
    'The message contains an illegial attachment that is not allowed by the server.',
  ErrorYahooSendMessageSpamSuspected:
    'The message has been blocked by Yahoo\'s outbound spam filter.',
  ErrorYahooSendMessageDailyLimitExceeded:
    'The message has been blocked by Yahoo - you have exceeded your daily sending limit.',
  ErrorNoSender: 'The message has been blocked because no sender is configured.',

  ErrorIdentityMissingFields:
    'Your EdisonMail ID is missing required fields - you may need to reset EdisonMail. http://support.getmailspring.com/hc/en-us/articles/115002012491',
};

export const mailSyncModes = {
  RESET: 'reset',
  SYNC: 'sync',
  SIFT: 'sift'
};

export default class MailsyncProcess extends EventEmitter {
  constructor({ configDirPath, resourcePath, verbose }) {
    super();
    this.verbose = verbose;
    this.resourcePath = resourcePath;
    this.configDirPath = configDirPath;
    this.binaryPath = path.join(resourcePath, 'mailsync').replace('app.asar', 'app.asar.unpacked');
    // this.binaryPath = path.join('/Users/zsq/Library/Developer/Xcode/DerivedData/EdisonMailSync-gnxarlbpnlszfmgdglqxwrawejbo/Build/Products/Debug', 'mailsync').replace('app.asar', 'app.asar.unpacked');
    this.killNativeScript = path.join(resourcePath, 'src', 'scripts', process.platform === 'darwin' ? 'mac' : process.platform, 'killNative').replace('app.asar', 'app.asar.unpacked');
    this._proc = null;
    this.isRemoving = false;
    this._win = null;
    // This only needs to be set if we are running in sift mode.
    this.accounts = null;
    // these must be set before you use the process
    this.account = null;
    this.identity = null;
    this.syncInitilMessageSend = false;
    this._sendMessageQueue = [];
    this._mode = '';
    this.dataShareOptOut = false;
  }

  _showStatusWindow(mode) {
    if (this._win) return;
    const { BrowserWindow } = require('electron');
    this._win = new BrowserWindow({
      width: 350,
      height: 108,
      show: false,
      center: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      fullscreenable: false,
      webPreferences: { nodeIntegration: false, javascript: false },
    });
    this._win.setContentSize(350, 90);
    this._win.once('ready-to-show', () => {
      this._win.show();
    });
    this._win.loadURL(`file://${this.resourcePath}/static/db-${mode}.html`);
  }

  _closeStatusWindow() {
    if (!this._win) return;
    this._win.removeAllListeners('ready-to-show');
    this._win.setClosable(true);
    this._win.hide();
    setTimeout(() => {
      // don't know why this timeout is necessary but the app becomes unable to
      // load Electron modules in the main process if we close immediately.
      if (!this._win.isDestroyed()) this._win.close();
      this._win = null;
    });
  }

  _spawnProcess(mode) {
    const env = {
      CONFIG_DIR_PATH: this.configDirPath,
      IDENTITY_SERVER: 'unknown',
    };
    if (process.type === 'renderer') {
      const rootURLForServer = require('./flux/mailspring-api-request').rootURLForServer;
      env.IDENTITY_SERVER = rootURLForServer('identity');
    }

    const args = [`--mode`, mode];
    this._mode = mode;
    if (this.verbose) {
      args.push('--verbose');
    }
    if (this.account) {
      args.push('--info', this.account.id);
    } else {
      args.push('--info', mode);
    }
    if (mode === mailSyncModes.SIFT) {
      if (this.dataShareOptOut) {
        args.push('--optOut', 1);
      } else {
        args.push('--optOut', 0);
      }
    }
    this._proc = spawn(this.binaryPath, args, { env });

    /* Allow us to buffer up to 1MB on stdin instead of 16k. This is necessary
    because some tasks (creating replies to drafts, etc.) can be gigantic amounts
    of HTML, many tasks can be created at once, etc, and we don't want to kill
    the channel. */
    if (this._proc.stdin) {
      this._proc.stdin.setDefaultEncoding('utf-8');
      this._proc.stdin.highWaterMark = 1024 * 1024;
    }

    // stdout may not be present if an error occurred. Error handler hasn't been
    // attached yet, but will be by the caller of spawnProcess.
    if (this.account && this._proc.stdout && (mode !== mailSyncModes.RESET || mode !== mailSyncModes.SIFT)) {
      this._proc.stdout.once('data', () => {
        var rs = new Readable();
        rs.push(`${JSON.stringify(this.account)}\n${JSON.stringify(this.identity)}\n`);
        rs.push(null);
        rs.pipe(
          this._proc.stdin,
          { end: false }
        );
        if (AppEnv.enabledToNativeLog) {
          console.log('--------------------To native---------------');
          AppEnv.logDebug(
            `to native: ${JSON.stringify(this.account)}\n${JSON.stringify(this.identity)}\n`,
          );
          console.log('-----------------------------To native END-----------------------');
        }
        this.syncInitilMessageSend = true;
        this._flushSendQueue();
      });
    } else if (this.accounts && this._proc.stdout && mode === mailSyncModes.SIFT){
      this._proc.stdout.once('data', () => {
        const rs = new Readable();
        let siftAccountString = '';
        for (let acct of this.accounts) {
          siftAccountString += `${JSON.stringify(acct)}\n`;
        }
        rs.push(siftAccountString);
        rs.push(null);
        rs.pipe(
          this._proc.stdin,
          { end: false }
        );
        // if (AppEnv.enabledToNativeLog) {
        //   console.log('--------------------To native---------------');
        //   AppEnv.logDebug(`to sift: ${siftAccountString}`);
        //   console.log('-----------------------------To native END-----------------------');
        // }
        this.syncInitilMessageSend = true;
        this._flushSendQueue();
      });
    }
  }

  _spawnAndWait(mode, { onData } = {}) {
    return new Promise((resolve, reject) => {
      this._spawnProcess(mode);
      let buffer = Buffer.from([]);
      if (this._proc.stdout) {
        this._proc.stdout.on('data', data => {
          buffer += data;
          if (onData) onData(data);
        });
      }
      if (this._proc.stderr) {
        this._proc.stderr.on('data', data => {
          buffer += data;
          if (onData) onData(data);
        });
      }

      this._proc.on('error', err => {
        reject(err);
      });

      this._proc.on('close', code => {
        const stripSecrets = text => {
          const settings = (this.account && this.account.settings) || {};
          const { refresh_token, imap_password, smtp_password } = settings;

          const escape = string => string.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          return (text || '')
            .replace(new RegExp(escape(refresh_token || 'not-present'), 'g'), '*********')
            .replace(new RegExp(escape(imap_password || 'not-present'), 'g'), '*********')
            .replace(new RegExp(escape(smtp_password || 'not-present'), 'g'), '*********');
        };

        try {
          const lastLine = buffer
            .toString('UTF-8')
            .trim()
            .split('\n')
            .pop();
          const response = JSON.parse(lastLine);
          if (code === 0) {
            resolve({ response, buffer });
          } else {
            let msg = LocalizedErrorStrings[response.error] || response.error;
            if (response.error_service) {
              msg = `${msg} (${response.error_service.toUpperCase()})`;
            }
            const error = new Error(msg);
            error.rawLog = stripSecrets(response.log);
            reject(error);
          }
        } catch (err) {
          if (code !== 0) {
            const error = new Error(`An unexpected mailsync error occurred (${code})`);
            console.error(`Error while getting native is closing: ${err}`);
            console.error(`last buffer is: ${buffer}`);
            error.rawLog = stripSecrets(buffer.toString());
            reject(error);
          } else {
            console.error(`Error while parsing native buffer ${buffer}`);
            AppEnv.debugLog(buffer.toString('UTF-8'));
            resolve({ response: {}, buffer });
          }
        }
      });
    });
  }

  kill() {
    const pid = this._proc.pid;
    console.warn(`Terminating mailsync... @ pid ${this._proc.pid}`);
    this._proc.kill();
    spawn(this.killNativeScript, [pid], { detached: true, stdio: 'ignore' });
  }

  _arrayTrim(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (!arr[i] || !arr[i].trim()) {
        arr.pop();
      } else {
        break;
      }
    }
    return arr;
  }

  sift() {
    this.sync(mailSyncModes.SIFT);
  }

  sync(mode = mailSyncModes.SYNC) {
    this._spawnProcess(mode);
    let outBuffer = '';
    let errBuffer = null;

    if (this._proc.stdout) {
      this._proc.stdout.on('data', data => {
        const added = data.toString();
        if (added.trim() === 'Waiting for Account JSON:') {
          return;
        }
        const isIndexOfEnter = added && added.lastIndexOf('\n') === (added.length - 1);
        outBuffer += added;

        if (isIndexOfEnter) {
          const msgs = this._arrayTrim(outBuffer.split('\n'));
          outBuffer = '';
          this.emit('deltas', msgs);
        }
      });
    }
    if (this._proc.stderr) {
      this._proc.stderr.on('data', data => {
        errBuffer += data.toString();
      });
    }
    this._proc.on('error', err => {
      console.log(`Sync worker exited with ${err}`);
      this.emit('error', err);
    });

    let cleanedUp = false;
    const onStreamCloseOrExit = (code, signal) => {
      if (cleanedUp) {
        return;
      }

      let error = null;
      let lastJSON = null;
      try {
        lastJSON = outBuffer.length && JSON.parse(outBuffer);
      } catch (err) {
        AppEnv.reportError(new Error(`parse outBuffer failed: ${outBuffer}`));
      } finally {
        if (lastJSON) {
          if (lastJSON.error) {
            error = new Error(lastJSON.error);
          } else {
            this.emit('deltas', [outBuffer]);
          }
        }
      }

      if (errBuffer) {
        error = new Error(errBuffer);
      }

      cleanedUp = true;
      this.emit('close', { code, error, signal });
    };

    this._proc.on('error', error => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      this.emit('close', { code: -1, error, signal: null });
    });
    this._proc.on('close', onStreamCloseOrExit);
    this._proc.on('exit', onStreamCloseOrExit);
  }

  isSyncReadyToReceiveMessage() {
    return this.syncInitilMessageSend;
  }

  appendToSendQueue(json) {
    if (this.syncInitilMessageSend) {
      this.sendMessage(json);
      return false;
    }
    this._sendMessageQueue.push(json);
  }

  _flushSendQueue() {
    if (!this.syncInitilMessageSend || this.isRemoving) {
      return false;
    }
    for (let i = 0; i < this._sendMessageQueue.length; i++) {
      if (AppEnv.enabledToNativeLog) {
        console.log('--------------------To native ---------------');
        AppEnv.logDebug(`to native: flushing queue: ${this.account ? this.account.id : 'no account'} - ${this._sendMessageQueue[i]}`);
        console.log('-----------------------------To native END-----------------------');
      }
      this.sendMessage(this._sendMessageQueue[i]);
    }
    this._sendMessageQueue = [];
  }

  sendMessage(json) {
    if (this.isRemoving) {
      console.log('marked for remove, ignoring messages');
      return;
    }
    if (!Utils) {
      Utils = require('mailspring-exports').Utils;
    }
    const msg = `${JSON.stringify(json)}\n`;
    if (AppEnv.enabledToNativeLog) {
      console.log('--------------------To native---------------');
      AppEnv.logDebug(
        `to ${this._mode === mailSyncModes.SIFT ? 'native: sift' : 'native'}: ${
          this.account ? this.account.id : 'no account'
        } - ${msg}`
      );
      console.log('-----------------------------To native END-----------------------');
    }
    try {
      this._proc.stdin.write(msg, 'UTF8');
    } catch (error) {
      let id = '';
      if (this._proc && this._proc.pid) {
        id = this._proc.pid;
      }
      AppEnv.logDebug(`@pid ${id} mailsync write error: ${error.message}`);
      if (error && error.message.includes('socket has been ended')) {
        // but try to kill it anyway and then force-emit a 'close' to trigger
        // the bridge to restart us.
        // The process probably already exited and we missed it somehow,

        this.kill();
        AppEnv.logDebug(`pid@${id} mailsync-process sendMessage error:  ${error.message}`);
        this.emit('close', { code: -2, error, signal: null });
      }
    }
  }

  async migrate() {
    try {
      console.log('Running database migrations');
      const { buffer } = await this._spawnAndWait('migrate', {
        onData: data => {
          const str = data.toString().toLowerCase();
          if (str.includes('running migration')) this._showStatusWindow('migration');
          if (str.includes('running vacuum')) this._showStatusWindow('vacuum');
        },
      });
      const migrateReturn = buffer.toString().trim();
      const ret = JSON.parse(migrateReturn);
      this._closeStatusWindow();
      if (ret && ret.version) {
        return ret.version;
      } else {
        return '';
      }
    } catch (err) {
      this._closeStatusWindow();
      throw err;
    }
  }

  resetCache() {
    return this._spawnAndWait('reset');
  }

  test() {
    console.log('Running mailsync in test account mode');
    return this._spawnAndWait('test');
  }

  attachToXcode() {
    const tmppath = path.join(os.tmpdir(), 'attach.applescript');
    fs.writeFileSync(
      tmppath,
      `
tell application "Xcode"
  activate
end tell

tell application "System Events"
  tell application process "Xcode"
    click (menu item "Attach to Process by PID or Name…" of menu 1 of menu bar item "Debug" of menu bar 1)
  end tell
  tell application process "Xcode"
    set value of text field 1 of sheet 1 of window 1 to "${this._proc.pid}"
  end tell
  delay 0.5
  tell application process "Xcode"
    click button "Attach" of sheet 1 of window 1
  end tell
  
end tell
    `,
    );
    exec(`osascript ${tmppath}`);
  }
}
