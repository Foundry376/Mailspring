import { remote } from 'electron';
import keytar from 'keytar';
import aes from 'crypto-js/aes';
import utf8 from 'crypto-js/enc-utf8';

const weakPassword = '233ceoTeuoR/o-ecTE';

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
    this.SERVICE_NAME = AppEnv.inDevMode() ? 'EdisonMail Dev' : 'EdisonMail';
    this.KEY_NAME = 'EdisonMail Keys';
    this.CONFIGKEY = 'accountCredentials';
    this.CHAT_PREFIX = 'CHAT-';
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

  accTokenCache = {}
  async getAccessTokenByEmail(email) {
    let accToken = null;
    // cache the access_token
    if (this.accTokenCache[email]) {
      return this.accTokenCache[email];
    }
    try {
      const keys = await this._getKeyHash(this.CHAT_PREFIX);
      accToken = keys[`${email}-accessToken`];
      this.accTokenCache[email] = accToken;
    } catch (err) {
      this._reportFatalError(err);
    }
    return accToken;
  }

  async extractChatAccountSecrets(account) {
    try {
      const keys = await this._getKeyHash(this.CHAT_PREFIX);
      keys[`${account.email}-password`] = account.password;
      keys[`${account.email}-accessToken`] = account.accessToken;
      await this._writeKeyHash(keys, this.CHAT_PREFIX);
    } catch (err) {
      this._reportFatalError(err);
    }
    const next = account.clone();
    delete next.password;
    delete next.accessToken;
    return next;
  }

  async insertChatAccountSecrets(account) {
    const next = account.clone();
    const keys = await this._getKeyHash(this.CHAT_PREFIX);
    if (keys[`${account.email}-password`]) {
      next.password = keys[`${account.email}-password`];
    }
    if (keys[`${account.email}-accessToken`]) {
      next.accessToken = keys[`${account.email}-accessToken`];
    }
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

  async _getKeyHash(prefix = '') {
    let raw = '{}';
    const cipherText = AppEnv.config.get(prefix + this.CONFIGKEY);
    if (cipherText && cipherText.length > 0) {
      try {
        let bytes = aes.decrypt(cipherText, weakPassword);
        raw = bytes.toString(utf8);
      } catch (err) {
        console.log('decrypt account credentials failed: ', err);
      }
    }
    if (raw === '{}') {
      try {
        raw = (await keytar.getPassword(this.SERVICE_NAME, prefix + this.KEY_NAME)) || '{}';
        AppEnv.config.unset(prefix + this.CONFIGKEY);
      } catch (err) {
        console.log('keychain access failed: ', err);
        throw err;
      }
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      return {};
    }
  }

  async _writeKeyHash(keys, prefix = '') {
    try {
      await keytar.setPassword(this.SERVICE_NAME, prefix + this.KEY_NAME, JSON.stringify(keys));
      AppEnv.config.unset(prefix + this.CONFIGKEY);
    } catch (err) {
      console.log('Failed to write to keychain: ', err);
      try {
        const encryptedText = aes.encrypt(JSON.stringify(keys), weakPassword).toString();
        AppEnv.config.set(prefix + this.CONFIGKEY, encryptedText);
      } catch (err) {
        return Promise.reject('Storing credentials failed');
      }
    }
  }

  _reportFatalError(err) {
    let more = '';
    if (process.platform === 'linux') {
      more = 'Make sure you have `libsecret` installed and a keyring is present. ';
    }
    remote.dialog
      .showMessageBox({
        type: 'error',
        buttons: ['Quit'],
        message: `EdisonMail could not store your password securely. ${more} For more information, visit http://support.getmailspring.com/hc/en-us/articles/115001875571`,
      })
      .then(() => {
        // tell the app to exit and rethrow the error to ensure code relying
        // on the passwords being saved never runs (saving identity for example)
        remote.app.quit();
      });
    throw err;
  }
}

export default new KeyManager();
