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

    console.log("Constructing Key Manager. Keys Migrated?", this.isMigrated());

    if (!this.isMigrated()) {
      console.log("Keys not yet migrated. Migrating now...");
      keytar.getPassword(SERVICE_NAME, KEY_NAME).then(raw => {
        if (raw === null) {
          raw = "{}";
        }
        const keys = JSON.parse(raw) as KeySet;
        this._writeKeyHash(keys);
        keytar.deletePassword(SERVICE_NAME, KEY_NAME);
        this.setMigrated(true);
        console.log("Key Migration finished");
      });
    }
  }

  isMigrated() {
    const result = AppEnv.config.get(configCredentialsMigratedKey) || false
    return result;
  }

  setMigrated(value: Boolean) {
    AppEnv.config.set(configCredentialsMigratedKey, value);
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
    // TODO: Remove when Keytar is completely removed
    // Wait until key migration has finished
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let isMigrated = this.isMigrated();
    while (!isMigrated) {
      console.log("Waiting 1 second for migration to finish");
      await delay(1000);
      isMigrated = this.isMigrated();
    }

    let raw = '{}';
    const encryptedCredentials = AppEnv.config.get(configCredentialsKey);
    // Check for different null values to prevent issues if a migration from keytar has failed
    if (encryptedCredentials !== undefined && encryptedCredentials !== null && encryptedCredentials !== "null") {
      raw = await safeStorage.decryptString(Buffer.from(encryptedCredentials, "utf-8"));
    }
    try {
      return JSON.parse(raw) as KeySet;
    } catch (err) {
      return {} as KeySet;
    }
  }

  async _writeKeyHash(keys: KeySet) {
    const enrcyptedCredentials = await safeStorage.encryptString(JSON.stringify(keys))
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
      shell.openExternal("https://community.getmailspring.com/t/password-management-error/199")
    }

    // TODO: Remove when removing the keytar dependencies
    // If we are in the snap environment and this fails, we ensure that the migration from keytar can run again
    if (process.env.SNAP) {
      this.setMigrated(false);
    }

    // tell the app to exit and rethrow the error to ensure code relying
    // on the passwords being saved never runs (saving identity for example)
    require('@electron/remote').app.quit();
    throw err;
  }
}

export default new KeyManager();
