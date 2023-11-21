import { localized } from './intl';
import { Account } from 'mailspring-exports';

interface KeySet {
  [key: string]: string;
}

const { safeStorage } = require('@electron/remote');

const configCredentialsKey = 'credentials';

/**
 * A basic wrap around electron's secure key management. Consolidates all of
 * our keys under a single namespaced keymap and provides migration
 * support.
 *
 * Consolidating this prevents a ton of key authorization popups for each
 * and every key we want to access.
 */
class KeyManager {
  async deleteAccountSecrets(account: Account) {
    try {
      const keys = await this._getKeyHash();
      delete keys[`${account.emailAddress}-imap`];
      delete keys[`${account.emailAddress}-smtp`];
      delete keys[`${account.emailAddress}-refresh-token`];
      await this._writeKeyHash(keys);
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async extractAndStoreAccountSecrets(account: Account) {
    try {
      const keys = await this._getKeyHash();
      keys[`${account.emailAddress}-imap`] = account.settings.imap_password;
      keys[`${account.emailAddress}-smtp`] = account.settings.smtp_password;
      keys[`${account.emailAddress}-refresh-token`] = account.settings.refresh_token;
      await this._writeKeyHash(keys);
    } catch (err) {
      this._reportFatalError(err);
    }
    const next = account.clone();
    delete next.settings.imap_password;
    delete next.settings.smtp_password;
    delete next.settings.refresh_token;
    return next;
  }

  async insertAccountSecrets(account: Account, keys: KeySet = null) {
    const next = account.clone();
    if (!keys) keys = await this._getKeyHash();
    next.settings.imap_password = keys[`${account.emailAddress}-imap`];
    next.settings.smtp_password = keys[`${account.emailAddress}-smtp`];
    next.settings.refresh_token = keys[`${account.emailAddress}-refresh-token`];
    return next;
  }

  async replacePassword(keyName: string, newVal: string) {
    try {
      const keys = await this._getKeyHash();
      keys[keyName] = newVal;
      await this._writeKeyHash(keys);
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async deletePassword(keyName: string) {
    try {
      const keys = await this._getKeyHash();
      delete keys[keyName];
      await this._writeKeyHash(keys);
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async getPassword(keyName: string) {
    try {
      const keys = await this._getKeyHash();
      return keys[keyName];
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async _getKeyHash() {
    let raw = '{}';
    const encryptedCredentials = AppEnv.config.get(configCredentialsKey);
    // Check for different null values to prevent issues if a migration from keytar has failed
    if (
      encryptedCredentials !== undefined &&
      encryptedCredentials !== null &&
      encryptedCredentials !== 'null'
    ) {
      try {
        raw = await safeStorage.decryptString(Buffer.from(encryptedCredentials, 'utf-8'));
      } catch (err) {
        console.error('Mailspring encountered an error reading passwords from the keychain.');
        console.error(err);
      }
    }
    try {
      return JSON.parse(raw) as KeySet;
    } catch (err) {
      return {} as KeySet;
    }
  }

  async _writeKeyHash(keys: KeySet) {
    const enrcyptedCredentials = await safeStorage.encryptString(JSON.stringify(keys));
    AppEnv.config.set(configCredentialsKey, enrcyptedCredentials);
  }

  _reportFatalError(err: Error) {
    const clickedButton = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'error',
      buttons: [localized('Mailspring Help'), localized('Quit')],
      message: localized(
        `Mailspring could not store your password securely. For more information, visit %@`,
        'https://community.getmailspring.com/t/password-management-error/199'
      ),
    });

    if (clickedButton == 0) {
      const shell = require('electron').shell;
      shell.openExternal('https://community.getmailspring.com/t/password-management-error/199');
    }

    // tell the app to exit and rethrow the error to ensure code relying
    // on the passwords being saved never runs (saving identity for example)
    require('@electron/remote').app.quit();
    throw err;
  }
}

export default new KeyManager();
