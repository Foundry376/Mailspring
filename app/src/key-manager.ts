import { localized } from './intl';
import { Account } from 'mailspring-exports';

interface KeySet {
  [key: string]: string;
}

interface DecryptResult {
  result: string;
  shouldReEncrypt: boolean;
}

const { safeStorage } = require('@electron/remote');

const configCredentialsKey = 'credentials';

// The real keychain varies by platform and may be locked or absent, so specs replace this.
export const secureStorage = {
  isAvailable: (): Promise<boolean> => safeStorage.isAsyncEncryptionAvailable(),
  encrypt: (plaintext: string): Promise<Buffer> => safeStorage.encryptStringAsync(plaintext),
  decrypt: (encrypted: Buffer): Promise<DecryptResult> => safeStorage.decryptStringAsync(encrypted),
  // The synchronous API is kept only to read blobs written by 1.23 and earlier. On KWallet the
  // two APIs key off different wallet entries (sync: "Chromium Keys", async: "Mailspring Keys"),
  // so a 1.23 blob is unreadable through decryptStringAsync even though both are tagged "v11".
  decryptLegacy: (encrypted: Buffer): string => safeStorage.decryptString(encrypted),
};

// On Linux, Chromium's async keyring always has a last-resort provider whose key is a hardcoded
// constant ("peanuts"); its ciphertexts are tagged "v10" instead of a real keyring's "v11".
// isAsyncEncryptionAvailable() resolves true even when only that provider initialized, so the
// tag is the only signal that the desktop keyring is unusable.
const usesPlaintextFallbackKey = (encrypted: Buffer) =>
  process.platform === 'linux' && encrypted.subarray(0, 3).toString() === 'v10';

/**
 * A basic wrap around electron's secure key management. Consolidates all of
 * our keys under a single namespaced keymap and provides migration
 * support.
 *
 * Consolidating this prevents a ton of key authorization popups for each
 * and every key we want to access.
 */
class KeyManager {
  private _fatalErrorReported = false;
  private _reEncryptAttempted = false;

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

  async _getKeyHash(): Promise<KeySet> {
    const encryptedCredentials = AppEnv.config.get(configCredentialsKey);
    // Check for different null values to prevent issues if a migration from keytar has failed
    if (
      encryptedCredentials === undefined ||
      encryptedCredentials === null ||
      encryptedCredentials === 'null'
    ) {
      return {} as KeySet;
    }

    const encrypted = Buffer.from(encryptedCredentials, 'utf-8');
    let decrypted: DecryptResult;
    try {
      decrypted = await secureStorage.decrypt(encrypted);
    } catch (asyncErr) {
      try {
        // A blob from 1.23 or earlier. Flag it so it is rewritten with the async key below.
        decrypted = { result: secureStorage.decryptLegacy(encrypted), shouldReEncrypt: true };
      } catch (syncErr) {
        // Stored-but-unreadable is not the same as nothing stored. Resolving to an empty keyset
        // would let the next read-modify-write mutator persist it, erasing every account's
        // password over a locked keyring or a secret service that has not started yet.
        console.error('Mailspring could not read saved passwords.', asyncErr, syncErr);
        this._reportFatalError(
          new Error(
            localized('Mailspring could not read your saved passwords and cannot continue.') +
              this._encryptionUnavailableHint()
          )
        );
      }
    }

    let keys: KeySet;
    try {
      keys = JSON.parse(decrypted.result) as KeySet;
    } catch (err) {
      // Decrypted to something that is not a keyset: no passwords left to preserve.
      return {} as KeySet;
    }

    // Set by Chromium when the provider that encrypts new data is not the one this blob was
    // written with (e.g. Linux users moving to org.freedesktop.portal.Secret), and by the legacy
    // path above. The old key still decrypts, so this is hygiene: rewrite once, and never let a
    // failure become fatal.
    if (decrypted.shouldReEncrypt && !this._reEncryptAttempted) {
      this._reEncryptAttempted = true;
      try {
        await this._writeKeyHash(keys);
      } catch (err) {
        console.warn('Mailspring could not re-encrypt your saved passwords with the new key.', err);
      }
    }

    return keys;
  }

  _encryptionUnavailableHint() {
    return process.platform === 'linux'
      ? localized(
          ' On Linux, Mailspring stores passwords in your desktop keyring (KWallet, GNOME Keyring, or another Secret Service provider). Please make sure it is installed, running, and unlocked, then restart Mailspring.'
        )
      : '';
  }

  async _writeKeyHash(keys: KeySet) {
    const unavailable = () =>
      new Error(
        localized(
          `Mailspring could not store your password securely because encryption is not available on this system.`
        ) + this._encryptionUnavailableHint()
      );
    if (!(await secureStorage.isAvailable())) {
      throw unavailable();
    }
    const encryptedCredentials = await secureStorage.encrypt(JSON.stringify(keys));
    if (usesPlaintextFallbackKey(encryptedCredentials)) {
      throw unavailable();
    }
    AppEnv.config.set(configCredentialsKey, encryptedCredentials);
  }

  _reportFatalError(err: Error): never {
    // ensureClients is throttled rather than serialized, and _getKeyHash's callers report its
    // throw a second time, so only the first failure gets a dialog. The rest still propagate.
    if (this._fatalErrorReported) {
      (err as any).noSentry = true;
      throw err;
    }
    this._fatalErrorReported = true;

    const clickedButton = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'error',
      buttons: [localized('Mailspring Help'), localized('Quit')],
      message:
        err.message ||
        localized(
          `Mailspring could not store your password securely. For more information, visit %@`,
          'https://community.getmailspring.com/t/password-management-error/199'
        ),
    });

    if (clickedButton == 0) {
      const shell = require('electron').shell;
      shell.openExternal('https://community.getmailspring.com/t/password-management-error/199');
    }

    // tell the app to exit and rethrow the error to ensure code relying
    // on the passwords being saved never runs (saving identity for example).
    // Mark as user-visible so the global error handler does not also report
    // it to Sentry — the user has already been informed via the dialog above.
    (err as any).noSentry = true;
    require('@electron/remote').app.quit();
    throw err;
  }
}

export default new KeyManager();
