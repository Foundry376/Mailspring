import {
  Account,
  TaskQueue,
  AccountStore,
  DatabaseStore,
  ComponentRegistry,
  MailboxPerspective,
  FocusedPerspectiveStore,
} from 'mailspring-exports';
import { clipboard } from 'electron';

import Config from '../../src/config';
import * as configUtils from '../../src/config-utils';
import TimeOverride from './time-override';
import TestConstants from './test-constants';
import * as jasmineExtensions from './jasmine-extensions';

class MasterBeforeEach {
  loadSettings: any;

  setup(loadSettings, beforeEach) {
    this.loadSettings = loadSettings;
    const self = this;

    beforeEach(function jasmineBeforeEach() {
      const currentSpec = this;
      currentSpec.addMatchers({
        toHaveLength: jasmineExtensions.toHaveLength,
      });

      self._resetAppEnv();
      self._resetDatabase();
      self._resetTaskQueue();
      self._resetTimeOverride();
      self._resetAccountStore();
      self._resetConfig();
      self._resetClipboard();
      ComponentRegistry._clear();

      advanceClock(1000);
      TimeOverride.resetSpyData();
    });
  }

  _resetAppEnv() {
    // Don't actually write to disk
    spyOn(AppEnv, 'saveWindowState');

    // prevent specs from modifying N1's menus
    spyOn(AppEnv.menu, 'sendToBrowserProcess');

    FocusedPerspectiveStore._current = MailboxPerspective.forNothing();
  }

  _resetDatabase() {
    global.localStorage.clear();
    DatabaseStore._transactionQueue = undefined;

    // If we don't spy on DatabaseStore._query, then
    // `DatabaseStore.inTransaction` will never complete and cause all
    // tests that depend on transactions to hang.
    //
    // @_query("BEGIN IMMEDIATE TRANSACTION") never resolves because
    // DatabaseStore._query never runs because the @_open flag is always
    // false because we never setup the DB when `AppEnv.inSpecMode` is
    // true.
    spyOn(DatabaseStore, '_query').andCallFake(() => Promise.resolve([]));
  }

  _resetTaskQueue() {
    TaskQueue._queue = [];
    TaskQueue._completed = [];
    TaskQueue._onlineStatus = true;
  }

  _resetTimeOverride() {
    TimeOverride.resetTime();
    TimeOverride.enableSpies();
  }

  _resetAccountStore() {
    // Log in a fake user, and ensure that accountForId, etc. work
    AccountStore._accounts = [
      new Account({
        provider: 'gmail',
        name: TestConstants.TEST_ACCOUNT_NAME,
        emailAddress: TestConstants.TEST_ACCOUNT_EMAIL,
        id: TestConstants.TEST_ACCOUNT_ID,
        aliases: [
          `${TestConstants.TEST_ACCOUNT_NAME} Alternate <${
            TestConstants.TEST_ACCOUNT_ALIAS_EMAIL
          }>`,
        ],
      }),

      new Account({
        provider: 'gmail',
        name: 'Second',
        emailAddress: 'second@gmail.com',
        id: 'second-test-account-id',
        aliases: [
          'Second Support <second@gmail.com>',
          'Second Alternate <second+alternate@gmail.com>',
          'Second <second+third@gmail.com>',
        ],
      }),
    ];
  }

  _resetConfig() {
    // reset config before each spec; don't load or save from/to `config.json`
    let fakePersistedConfig = {
      env: 'production',
    };

    spyOn(Config.prototype, 'getRawValues').andCallFake(() => {
      return fakePersistedConfig;
    });

    spyOn(Config.prototype, 'setRawValue').andCallFake(function setRawValue(keyPath, value) {
      if (keyPath) {
        configUtils.setValueForKeyPath(fakePersistedConfig, keyPath, value);
      } else {
        fakePersistedConfig = value;
      }
      return this.load();
    });

    AppEnv.config = new Config();
    AppEnv.loadConfig();
  }

  _resetClipboard() {
    let clipboardContent = 'initial clipboard content';
    spyOn(clipboard, 'writeText').andCallFake(text => {
      clipboardContent = text;
    });
    spyOn(clipboard, 'readText').andCallFake(() => clipboardContent);
  }
}
export default new MasterBeforeEach();
