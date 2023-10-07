import keytar from 'keytar';
import { localized } from './intl';
import { Account } from 'mailspring-exports';

interface KeySet {
  [key: string]: string;
}

const { safeStorage } = require("@electron/remote");

const configCredentialsKey = 'credentials';
const configCredentialsMigratedKey = 'credentialsMigratedFromKeytar';

/**
 * A basic wrap around electron's secure key management. Consolidates all of
 * our keys under a single namespaced keymap and provides migration
 * support.
 *
 * Consolidating this prevents a ton of key authorization popups for each
 * and every key we want to access.
 */
class KeyManager {

  // TODO: Delete the migration from Keytar once its dependency can be removed
  constructor() {
    const SERVICE_NAME = AppEnv.inDevMode() ? 'Mailspring Dev' : 'Mailspring';
    const KEY_NAME = 'Mailspring Keys';

    if (!this.isMigrated()) {
      console.log("Keys not yet migrated. Migrating now...");
      keytar.getPassword(SERVICE_NAME, KEY_NAME).then(raw => {
        const keys = JSON.parse(raw) as KeySet;
        this._writeKeyHash(keys);
        // TODO: Enable this to clean up the keytar storage after everything is tested thoroughly, but before releasing the next version
        // keytar.deletePassword(SERVICE_NAME, KEY_NAME);
        this.setMigrated();
      });
    }
  }

  isMigrated() {
    const result = AppEnv.config.get(configCredentialsMigratedKey) || false
    return result;
  }

  setMigrated() {
    AppEnv.config.set(configCredentialsMigratedKey, 'true');
  }

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
    // TODO: Remove when Keytar is completely removed
    // Wait until key migration has finished
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let isMigrated = this.isMigrated();
    while (!isMigrated) {
      await delay(1000);
      isMigrated = this.isMigrated();
    }

    let raw = '{}';
    const encryptedCredentials = AppEnv.config.get(configCredentialsKey);
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
    const enrcyptedCredentials = await safeStorage.encryptString(JSON.stringify(keys))
    AppEnv.config.set(configCredentialsKey, enrcyptedCredentials);
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
