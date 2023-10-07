import keytar from 'keytar';
import { localized } from './intl';
import { Account, CredentialStore } from 'mailspring-exports';

interface KeySet {
  [key: string]: string;
}

const { safeStorage } = require("@electron/remote");

/**
 * A basic wrap around electron's secure key management. Consolidates all of
 * our keys under a single namespaced keymap and provides migration
 * support.
 *
 * Consolidating this prevents a ton of key authorization popups for each
 * and every key we want to access.
 */
class KeyManager {
  SERVICE_NAME = AppEnv.inDevMode() ? 'Mailspring Dev' : 'Mailspring';

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
    const keys = await this._getKeyHash();
    try {
      delete keys[keyName];
    } catch (err) {
      console.log('Could not delete password as it did not exist', err);
    }
    await this._writeKeyHash(keys);
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
    const encryptedCredentials = CredentialStore.get();
    console.log('Trying to decrpyt: ', encryptedCredentials);
    let raw = '{}';
    if (encryptedCredentials !== undefined) {
      raw = await safeStorage.decryptString(Buffer.from(encryptedCredentials, "utf-8"));
    }
    try {
      return JSON.parse(raw) as KeySet;
    } catch (err) {
      return {};
    }
  }

  async _writeKeyHash(keys: KeySet) {
    console.log('Enrcypting: ', JSON.stringify(keys));
    const enrcyptedCredentials = safeStorage.encryptString(JSON.stringify(keys))
    CredentialStore.set(enrcyptedCredentials);
  }

  _reportFatalError(err: Error) {
    let more = '';
    if (process.platform === 'linux') {
      more = localized('Make sure you have `libsecret` installed and a keyring is present. ');
    }
    require('@electron/remote').dialog.showMessageBoxSync({
      type: 'error',
      buttons: [localized('Quit')],
      message: localized(
        `Mailspring could not store your password securely. %@ For more information, visit %@`,
        more,
        'http://support.getmailspring.com/hc/en-us/articles/115001875571'
      ),
    });

    // tell the app to exit and rethrow the error to ensure code relying
    // on the passwords being saved never runs (saving identity for example)
    require('@electron/remote').app.quit();
    throw err;
  }
}

export default new KeyManager();
