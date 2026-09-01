import KeyManager, { secureStorage } from '../src/key-manager';

const CREDENTIALS_KEY = 'credentials';

// A stored blob is a JSON-serialized Buffer, which is what config.get() hands back.
const storedBlob = () => Buffer.from('v10encrypted').toJSON();

describe('KeyManager', function () {
  beforeEach(function () {
    // The manager is a singleton, so its once-per-session guards leak between specs.
    (KeyManager as any)._fatalErrorReported = false;
    (KeyManager as any)._reEncryptAttempted = false;

    this.config = {};
    spyOn(AppEnv.config, 'get').andCallFake((key: string) => this.config[key]);
    spyOn(AppEnv.config, 'set').andCallFake((key: string, val: any) => {
      this.config[key] = val;
    });
    spyOn(secureStorage, 'isAvailable').andCallFake(() => Promise.resolve(true));
    spyOn(secureStorage, 'encrypt').andCallFake((plaintext: string) =>
      Promise.resolve(Buffer.from(plaintext))
    );
  });

  describe('_getKeyHash', function () {
    it('returns an empty set when nothing has been stored', async function () {
      spyOn(secureStorage, 'decrypt');
      expect(await KeyManager._getKeyHash()).toEqual({});
      expect(secureStorage.decrypt).not.toHaveBeenCalled();
    });

    // A failed keytar migration can leave any of these behind.
    ['null', null, undefined].forEach((value) => {
      it(`returns an empty set for a ${JSON.stringify(value)} placeholder`, async function () {
        this.config[CREDENTIALS_KEY] = value;
        spyOn(secureStorage, 'decrypt');
        expect(await KeyManager._getKeyHash()).toEqual({});
        expect(secureStorage.decrypt).not.toHaveBeenCalled();
      });
    });

    it('returns the decrypted keys', async function () {
      this.config[CREDENTIALS_KEY] = storedBlob();
      spyOn(secureStorage, 'decrypt').andCallFake(() =>
        Promise.resolve({ result: '{"a-imap":"secret"}', shouldReEncrypt: false })
      );
      expect(await KeyManager._getKeyHash()).toEqual({ 'a-imap': 'secret' });
    });

    it('is fatal when a stored blob cannot be decrypted', async function () {
      this.config[CREDENTIALS_KEY] = storedBlob();
      spyOn(secureStorage, 'decrypt').andCallFake(() =>
        Promise.reject(new Error('keyring locked'))
      );
      spyOn(KeyManager, '_reportFatalError').andCallFake((err: Error) => {
        throw err;
      });

      let raised: Error = null;
      try {
        await KeyManager._getKeyHash();
      } catch (err) {
        raised = err;
      }
      expect(raised).not.toBe(null);
      expect(KeyManager._reportFatalError).toHaveBeenCalled();
    });

    // The regression this guards: an unreadable blob resolving to {} let the next
    // read-modify-write mutator persist it over every account's password.
    it('does not overwrite stored credentials when decryption fails', async function () {
      const untouched = storedBlob();
      this.config[CREDENTIALS_KEY] = untouched;
      spyOn(secureStorage, 'decrypt').andCallFake(() =>
        Promise.reject(new Error('keyring locked'))
      );
      spyOn(KeyManager, '_reportFatalError').andCallFake((err: Error) => {
        throw err;
      });

      try {
        await KeyManager.replacePassword('a-imap', 'new');
      } catch (err) {
        // replacePassword reports and rethrows.
      }
      expect(secureStorage.encrypt).not.toHaveBeenCalled();
      expect(this.config[CREDENTIALS_KEY]).toBe(untouched);
    });

    it('starts over when the decrypted value is not a keyset', async function () {
      this.config[CREDENTIALS_KEY] = storedBlob();
      spyOn(secureStorage, 'decrypt').andCallFake(() =>
        Promise.resolve({ result: 'not json', shouldReEncrypt: false })
      );
      spyOn(KeyManager, '_reportFatalError');
      expect(await KeyManager._getKeyHash()).toEqual({});
      expect(KeyManager._reportFatalError).not.toHaveBeenCalled();
    });
  });

  describe('re-encryption', function () {
    beforeEach(function () {
      this.config[CREDENTIALS_KEY] = storedBlob();
      this.shouldReEncrypt = true;
      spyOn(secureStorage, 'decrypt').andCallFake(() =>
        Promise.resolve({ result: '{"a-imap":"secret"}', shouldReEncrypt: this.shouldReEncrypt })
      );
    });

    it('rewrites the blob when the key provider has changed', async function () {
      expect(await KeyManager._getKeyHash()).toEqual({ 'a-imap': 'secret' });
      expect(secureStorage.encrypt).toHaveBeenCalledWith('{"a-imap":"secret"}');
    });

    it('does not rewrite the blob when the provider is unchanged', async function () {
      this.shouldReEncrypt = false;
      await KeyManager._getKeyHash();
      expect(secureStorage.encrypt).not.toHaveBeenCalled();
    });

    it('only rewrites once per session', async function () {
      await KeyManager._getKeyHash();
      await KeyManager._getKeyHash();
      expect((secureStorage.encrypt as jasmine.Spy).calls.length).toBe(1);
    });

    // The keys just read are valid either way, so a failed rewrite must not quit the app.
    it('returns the keys and stays non-fatal when the rewrite fails', async function () {
      (secureStorage.isAvailable as jasmine.Spy).andCallFake(() => Promise.resolve(false));
      spyOn(KeyManager, '_reportFatalError');
      expect(await KeyManager._getKeyHash()).toEqual({ 'a-imap': 'secret' });
      expect(KeyManager._reportFatalError).not.toHaveBeenCalled();
    });
  });

  describe('_writeKeyHash', function () {
    it('throws when encryption is unavailable', async function () {
      (secureStorage.isAvailable as jasmine.Spy).andCallFake(() => Promise.resolve(false));
      let raised: Error = null;
      try {
        await KeyManager._writeKeyHash({ 'a-imap': 'secret' });
      } catch (err) {
        raised = err;
      }
      expect(raised).not.toBe(null);
      expect(secureStorage.encrypt).not.toHaveBeenCalled();
    });
  });

  describe('_reportFatalError', function () {
    it('shows one dialog no matter how many failures arrive', function () {
      const remote = require('@electron/remote');
      spyOn(remote.dialog, 'showMessageBoxSync').andReturn(1);
      spyOn(remote.app, 'quit');

      for (let i = 0; i < 3; i++) {
        try {
          KeyManager._reportFatalError(new Error('nope'));
        } catch (err) {
          // always rethrows so callers abort
        }
      }
      expect((remote.dialog.showMessageBoxSync as jasmine.Spy).calls.length).toBe(1);
      expect((remote.app.quit as jasmine.Spy).calls.length).toBe(1);
    });
  });
});
