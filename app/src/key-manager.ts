import { remote } from 'electron';
import keytar from 'keytar';
import { localized } from './intl';

/**
 * A basic wrap around keytar's secure key management. Consolidates all of
 * our keys under a single namespaced keymap and provides migration
 * support.
 *
 * Consolidating this prevents a ton of key authorization popups for each
 * and every key we want to access.
 */
class KeyManager {
  constructor() {
    this.SERVICE_NAME = AppEnv.inDevMode() ? 'Mailspring Dev' : 'Mailspring';
    this.KEY_NAME = 'Mailspring Keys';
  }

  async deleteAccountSecrets(account) {
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

  async extractAccountSecrets(account) {
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

  async insertAccountSecrets(account) {
    const next = account.clone();
    const keys = await this._getKeyHash();
    next.settings.imap_password = keys[`${account.emailAddress}-imap`];
    next.settings.smtp_password = keys[`${account.emailAddress}-smtp`];
    next.settings.refresh_token = keys[`${account.emailAddress}-refresh-token`];
    return next;
  }

  async replacePassword(keyName, newVal) {
    try {
      const keys = await this._getKeyHash();
      keys[keyName] = newVal;
      await this._writeKeyHash(keys);
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async deletePassword(keyName) {
    try {
      const keys = await this._getKeyHash();
      delete keys[keyName];
      await this._writeKeyHash(keys);
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async getPassword(keyName) {
    try {
      const keys = await this._getKeyHash();
      return keys[keyName];
    } catch (err) {
      this._reportFatalError(err);
    }
  }

  async _getKeyHash() {
    const raw = (await keytar.getPassword(this.SERVICE_NAME, this.KEY_NAME)) || '{}';
    try {
      return JSON.parse(raw);
    } catch (err) {
      return {};
    }
  }

  async _writeKeyHash(keys) {
    await keytar.setPassword(this.SERVICE_NAME, this.KEY_NAME, JSON.stringify(keys));
  }

  _reportFatalError(err) {
    let more = '';
    if (process.platform === 'linux') {
      more = localized('Make sure you have `libsecret` installed and a keyring is present. ');
    }
    remote.dialog.showMessageBox({
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
    remote.app.quit();
    throw err;
  }
}

export default new KeyManager();
