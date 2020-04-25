import path from 'path';
import fs from 'fs';
import { ipcRenderer, remote } from 'electron';
import { localized } from '../intl';
import _ from 'underscore';

import { Task } from './tasks/task';
import TaskQueue from './stores/task-queue';
import { IdentityStore } from './stores/identity-store';

import { Account } from './models/account';
import { AccountStore } from './stores/account-store';
import DatabaseStore from './stores/database-store';
import OnlineStatusStore from './stores/online-status-store';
import DatabaseChangeRecord from './stores/database-change-record';
import DatabaseObjectRegistry from '../registries/database-object-registry';
import { MailsyncProcess } from '../mailsync-process';
import KeyManager from '../key-manager';
import * as Actions from './actions';
import * as Utils from './models/utils';

const MAX_CRASH_HISTORY = 10;

const VERBOSE_UNTIL_KEY = 'core.sync.verboseUntil';

/*
This class keeps track of how often Mailsync workers crash. If a mailsync
worker exits more than 5 times in <5 minutes, we consider it "too many failures"
and won't relaunch it until:

- the user restarts the app, clearing the history
- the user changes the account's settings (updating password, etc.)
- the user explicitly says "Try Again" in the UI

*/
class CrashTracker {
  _timestamps = {};
  _tooManyFailures = {};

  forgetCrashes(fullAccountJSON) {
    const key = this._keyFor(fullAccountJSON);
    delete this._timestamps[key];
    delete this._tooManyFailures[key];
  }

  recordClientCrash(fullAccountJSON, { code, error, signal }) {
    this._appendCrashToHistory(fullAccountJSON);

    // We now let crashpad do this, because Sentry was losing it's mind.
  }

  _keyFor({ id, settings }) {
    return JSON.stringify({ id, settings });
  }

  _appendCrashToHistory(fullAccountJSON) {
    const key = this._keyFor(fullAccountJSON);
    this._timestamps[key] = this._timestamps[key] || [];
    if (this._timestamps[key].unshift(Date.now()) > MAX_CRASH_HISTORY) {
      this._timestamps[key].length = MAX_CRASH_HISTORY;
    }

    // has the client crashed more than 5 times in the last 5 minutes?
    // If so, do not restart. We'll mark that the account is not syncing.
    if (
      this._timestamps[key].length >= 5 &&
      Date.now() - this._timestamps[key][4] < 5 * 60 * 1000
    ) {
      this._tooManyFailures[key] = true;
    }
  }

  tooManyFailures(fullAccountJSON) {
    const key = this._keyFor(fullAccountJSON);
    return this._tooManyFailures[key];
  }
}

export default class MailsyncBridge {
  _crashTracker = new CrashTracker();
  _clients: { [accountId: string]: MailsyncProcess } = {};
  _lastWait: number;

  constructor() {
    if (!AppEnv.isMainWindow() || AppEnv.inSpecMode()) {
      ipcRenderer.on('mailsync-bridge-message', this._onIncomingRebroadcastMessage);
      return;
    }

    // Temporary: allow calendar sync to be manually invoked
    ipcRenderer.on('run-calendar-sync', () => {
      for (const client of Object.values(this._clients)) {
        client.sendMessage({ type: 'sync-calendar' });
      }
    });

    Actions.queueTask.listen(this._onQueueTask, this);
    Actions.queueTasks.listen(this._onQueueTasks, this);
    Actions.cancelTask.listen(this._onCancelTask, this);
    Actions.fetchBodies.listen(this._onFetchBodies, this);

    AccountStore.listen(this.ensureClients, this);

    AppEnv.onBeforeUnload(this._onBeforeUnload);
    AppEnv.onReadyToUnload(this._onReadyToUnload);

    process.nextTick(() => {
      this.ensureClients();
    });
  }

  // Public

  openLogs() {
    const { configDirPath } = AppEnv.getLoadSettings();
    const configDirItem = path.join(configDirPath, 'config.json');
    require('electron').shell.showItemInFolder(configDirItem); // eslint-disable-line
  }

  toggleVerboseLogging() {
    const { configDirPath } = AppEnv.getLoadSettings();
    let message = localized('Thank you for helping debug Mailspring. Mailspring will now restart.');
    let phrase = 'disabled';

    if (AppEnv.config.get(VERBOSE_UNTIL_KEY)) {
      AppEnv.config.set(VERBOSE_UNTIL_KEY, 0);
    } else {
      AppEnv.config.set(VERBOSE_UNTIL_KEY, Date.now() + 30 * 60 * 1000);
      phrase = 'enabled';
      message =
        `Verbose logging will be enabled for the next thirty minutes. This records ` +
        `all network traffic to your mail providers and will be quite slow. Restart Mailspring ` +
        `and wait for your problem to occur, and then submit mailsync-***.log files located ` +
        `in the directory: \n\n${configDirPath}.\n\nMailspring will now restart.`;
    }
    AppEnv.showErrorDialog({
      title: localized(`Verbose logging is now %@`, phrase),
      message,
    });
    remote.app.relaunch();
    remote.app.quit();
  }

  clients() {
    return this._clients;
  }

  ensureClients = _.throttle(async () => {
    const clientsWithoutAccounts = { ...this._clients };
    const keys = await KeyManager._getKeyHash();

    for (const acct of AccountStore.accounts()) {
      if (!this._clients[acct.id]) {
        // client for this account is missing, launch it!
        this._launchClient(acct, keys);
      } else {
        // client for this account exists
        delete clientsWithoutAccounts[acct.id];
      }
    }

    // Any clients left in the `clientsWithoutAccounts` after we looped
    // through and deleted one for each accountId are ones representing
    // deleted accounts.
    for (const client of Object.values(clientsWithoutAccounts)) {
      client.kill();
    }
  }, 100);

  async forceRelaunchClient(account: Account) {
    const keys = await KeyManager._getKeyHash();
    this._launchClient(account, keys, { force: true });
  }

  async tailClientLog(accountId: string) {
    let log = '';
    const logfile = `mailsync-${accountId}.log`;
    try {
      const logpath = path.join(AppEnv.getConfigDirPath(), logfile);
      const { size } = fs.statSync(logpath);
      const tailSize = Math.min(3000, size);
      const buffer = Buffer.alloc(tailSize);
      const fd = fs.openSync(logpath, 'r');
      fs.readSync(fd, buffer, 0, tailSize, size - tailSize);
      log = buffer.toString('UTF8');
      log = log.substr(log.indexOf('\n') + 1);
    } catch (logErr) {
      console.warn(`Could not append ${logfile} to mailsync exception report: ${logErr}`);
    }
    return log;
  }

  sendSyncMailNow() {
    console.warn('Sending `wake` to all mailsync workers...');
    for (const client of Object.values(this._clients)) {
      client.sendMessage({ type: 'wake-workers' });
    }
  }

  sendMessageToAccount(accountId, json) {
    if (!this._clients[accountId]) {
      const { emailAddress } = AccountStore.accountForId(accountId) || { emailAddress: undefined };
      return AppEnv.showErrorDialog({
        title: localized(`Mailspring is unable to sync %@`, emailAddress),
        message: localized(
          `In order to perform actions on this mailbox, you need to resolve the sync issue. Visit Preferences > Accounts for more information.`
        ),
      });
    }
    this._clients[accountId].sendMessage(json);
  }

  async resetCacheForAccount(account, { silent }: { silent?: boolean } = {}) {
    // grab the existing client, if there is one
    const syncingClient = this._clients[account.id];

    // create a new client that will perform the reset
    const resetClient = new MailsyncProcess(this._getClientConfiguration());
    resetClient.account = (await KeyManager.insertAccountSecrets(account)).toJSON();
    resetClient.identity = IdentityStore.identity();

    // no-op - do not allow us to kill this client - we may be reseting the cache of an
    // account which does not exist anymore, but we don't want to interrupt this process
    resetClient.kill = () => {};

    this._clients[account.id] = resetClient;

    // kill the old client, ensureClients will be a no-op because the
    // client has already been replaced in our lookup table.
    if (syncingClient) {
      syncingClient.kill();
    }

    if (!silent) {
      AppEnv.showErrorDialog({
        title: localized(`Cleanup Started`),
        message: localized(
          `Mailspring is clearing it's cache for %@. Depending on the size of the mailbox, this may take a few seconds or a few minutes. An alert will appear when cleanup is complete.`,
          account.emailAddress
        ),
      });
    }

    try {
      const start = Date.now();

      await resetClient.resetCache();

      if (!silent) {
        AppEnv.showErrorDialog({
          title: localized(`Cleanup Complete`),
          message: localized(
            `Mailspring reset the local cache for %@ in %@ seconds. Your mailbox will now begin to sync again.`,
            account.emailAddress,
            Math.ceil((Date.now() - start) / 1000)
          ),
        });
      }
    } catch (error) {
      AppEnv.showErrorDialog({
        title: localized(`Cleanup Error`),
        message: localized(`Mailspring was unable to reset the local cache. %@`, error),
      });
    } finally {
      delete this._clients[account.id];
      process.nextTick(() => {
        this.ensureClients();
      });
    }
  }

  // Private

  _getClientConfiguration() {
    const { configDirPath, resourcePath } = AppEnv.getLoadSettings();
    const verboseUntil = AppEnv.config.get(VERBOSE_UNTIL_KEY) || 0;
    const verbose = verboseUntil && verboseUntil / 1 > Date.now();
    if (verbose) {
      console.warn(`Verbose mailsync logging is enabled until ${new Date(verboseUntil)}`);
    }
    return { configDirPath, resourcePath, verbose };
  }

  async _launchClient(account: Account, keys, { force }: { force?: boolean } = {}) {
    const client = new MailsyncProcess(this._getClientConfiguration());
    this._clients[account.id] = client; // set this synchornously so we never spawn two

    const fullAccountJSON = (await KeyManager.insertAccountSecrets(account, keys)).toJSON();

    if (force) {
      this._crashTracker.forgetCrashes(fullAccountJSON);
    } else if (this._crashTracker.tooManyFailures(fullAccountJSON)) {
      delete this._clients[account.id];
      return;
    }

    client.account = fullAccountJSON;
    client.identity = IdentityStore.identity();
    client.sync();
    client.on('deltas', this._onIncomingMessages);
    client.on('close', ({ code, error, signal }) => {
      if (this._clients[account.id] !== client) {
        return;
      }

      delete this._clients[account.id];
      if (signal === 'SIGTERM') {
        return;
      }
      this._crashTracker.recordClientCrash(fullAccountJSON, { code, error, signal });

      const isAuthFailure =
        `${error}`.includes('Response Code: 401') || // mailspring services
        `${error}`.includes('Response Code: 403') || // mailspring services
        `${error}`.includes('ErrorAuthentication'); // mailcore

      if (this._crashTracker.tooManyFailures(fullAccountJSON)) {
        Actions.updateAccount(account.id, {
          syncState: isAuthFailure ? Account.SYNC_STATE_AUTH_FAILED : Account.SYNC_STATE_ERROR,
          syncError: { code, error, signal },
        });
      } else {
        this.ensureClients();
      }
    });

    if (fullAccountJSON.syncState !== Account.SYNC_STATE_OK) {
      // note: This call triggers ensureClients, and must go after this.clients[id] is set
      Actions.updateAccount(account.id, {
        syncState: Account.SYNC_STATE_OK,
        syncError: null,
      });
    }
  }

  _onQueueTask(task) {
    if (!DatabaseObjectRegistry.isInRegistry(task.constructor.name)) {
      console.log(task);
      throw new Error(
        'You must queue a `Task` instance which is registred with the DatabaseObjectRegistry'
      );
    }
    if (!task.id) {
      console.log(task);
      throw new Error(
        'Tasks must have an ID prior to being queued. Check that your Task constructor is calling `super`'
      );
    }
    if (!task.accountId) {
      throw new Error(
        `Tasks must have an accountId. Check your instance of ${task.constructor.name}.`
      );
    }

    task.willBeQueued();

    task.status = 'local';
    task.origin = new Error().stack
      .split('\n')
      .slice(2)
      .join('\n');

    this.sendMessageToAccount(task.accountId, { type: 'queue-task', task: task });
  }

  _onQueueTasks(tasks) {
    if (!tasks || !tasks.length) {
      return;
    }
    for (const task of tasks) {
      this._onQueueTask(task);
    }
  }

  _onCancelTask(taskOrId) {
    let task = taskOrId;
    if (typeof taskOrId === 'string') {
      task = TaskQueue.queue().find(t => t.id === taskOrId);
    }
    if (task) {
      this.sendMessageToAccount(task.accountId, { type: 'cancel-task', taskId: task.id });
    }
  }

  _onIncomingMessages = msgs => {
    for (const msg of msgs) {
      if (msg.length === 0) {
        continue;
      }
      if (msg[0] !== '{') {
        console.log(`Sync worker sent non-JSON formatted message: ${msg}`);
        continue;
      }

      let json = null;
      try {
        json = JSON.parse(msg);
      } catch (err) {
        console.log(`Sync worker sent non-JSON formatted message: ${msg}. ${err}`);
        continue;
      }

      const { type, modelJSONs, modelClass } = json;
      if (!modelJSONs || !type || !modelClass) {
        console.log(`Sync worker sent a JSON formatted message with unexpected keys: ${msg}`);
        continue;
      }

      // Note: these deltas don't reflect a real model - we just stream in the process
      // state changes (online / offline) alongside the database changes.
      if (modelClass === 'ProcessState' && modelJSONs.length) {
        OnlineStatusStore.onSyncProcessStateReceived(modelJSONs[0]);
        continue;
      }

      // dispatch the message to other windows
      ipcRenderer.send('mailsync-bridge-rebroadcast-to-all', msg);

      const models = modelJSONs.map(Utils.convertToModel);
      this._onIncomingChangeRecord(
        new DatabaseChangeRecord({
          type, // TODO BG move to "model" naming style, finding all uses might be tricky
          objectClass: modelClass,
          objects: models,
          objectsRawJSON: modelJSONs,
        })
      );
    }
  };

  _onIncomingChangeRecord = (record: DatabaseChangeRecord) => {
    // Allow observers of the database to handle this change
    DatabaseStore.trigger(record);

    // Run task success / error handlers if the task is now complete
    // Note: cannot use `record.objectClass` because of subclass names
    if (record.type === 'persist' && record.objects[0] instanceof Task) {
      for (const obj of record.objects) {
        const task = obj as Task;
        if (task.status !== 'complete') {
          continue;
        }
        if (task.error != null) {
          task.onError(task.error);
        } else {
          task.onSuccess();
        }
      }
    }
  };

  _onIncomingRebroadcastMessage = (event, msg) => {
    const { type, modelJSONs, modelClass } = JSON.parse(msg);
    const models = modelJSONs.map(Utils.convertToModel);
    DatabaseStore.trigger(
      new DatabaseChangeRecord({
        type,
        objectClass: modelClass,
        objects: models,
        objectsRawJSON: modelJSONs,
      })
    );
  };

  _onFetchBodies(messages) {
    const byAccountId = {};
    for (const msg of messages) {
      byAccountId[msg.accountId] = byAccountId[msg.accountId] || [];
      byAccountId[msg.accountId].push(msg.id);
    }
    for (const accountId of Object.keys(byAccountId)) {
      this.sendMessageToAccount(accountId, { type: 'need-bodies', ids: byAccountId[accountId] });
    }
  }

  _onBeforeUnload = readyToUnload => {
    // If other windows are open, delay the closing of the main window
    // by 400ms the first time beforeUnload is called so other windows
    // ave a chance to save drafts before we kill the workers.
    if (remote.getGlobal('application').windowManager.getOpenWindowCount() <= 1) {
      return true;
    }
    if (this._lastWait && Date.now() - this._lastWait < 2000) {
      return true;
    }
    this._lastWait = Date.now();
    setTimeout(readyToUnload, 400);
    return false;
  };

  _onReadyToUnload = () => {
    for (const client of Object.values(this._clients)) {
      client.kill();
    }
    this._clients = {};
  };
}
