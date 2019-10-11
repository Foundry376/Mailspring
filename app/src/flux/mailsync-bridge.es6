import path from 'path';
import fs from 'fs';
import { ipcRenderer, remote } from 'electron';
import _ from 'underscore';

import Task from './tasks/task';
import SetObservableRangeTask from './models/set-observable-range-task';
import TaskQueue from './stores/task-queue';
import IdentityStore from './stores/identity-store';
import Account from './models/account';
import AccountStore from './stores/account-store';
import DatabaseStore from './stores/database-store';
import OnlineStatusStore from './stores/online-status-store';
import DatabaseChangeRecord from './stores/database-change-record';
import DatabaseObjectRegistry from '../registries/database-object-registry';
import MailsyncProcess from '../mailsync-process';
import KeyManager from '../key-manager';
import Actions from './actions';
import Utils from './models/utils';
import AnalyzeDBTask from './tasks/analyze-db-task';

const MAX_CRASH_HISTORY = 10;

const VERBOSE_UNTIL_KEY = 'core.sync.verboseUntil';

const MAX_ANALYZE_INTERVAL = 30 * 24 * 60 * 60 * 1000;
const ANALYZE_CHECK_INTERVAL = 60 * 60 * 1000;

/*
This class keeps track of how often Mailsync workers crash. If a mailsync
worker exits more than 5 times in <5 minutes, we consider it "too many failures"
and won't relaunch it until:

- the user restarts the app, clearing the history
- the user changes the account's settings (updating password, etc.)
- the user explicitly says "Try Again" in the UI

*/
class CrashTracker {
  constructor() {
    this._timestamps = {};
    this._tooManyFailures = {};
  }

  forgetCrashes(fullAccountJSON) {
    const key = this._keyFor(fullAccountJSON);
    delete this._timestamps[key];
    delete this._tooManyFailures[key];
  }

  tailClientLog(accountId) {
    let log = '';
    const logfile = `mailsync-${accountId}.log`;
    try {
      const logpath = path.join(AppEnv.getConfigDirPath(), logfile);
      const { size } = fs.statSync(logpath);
      const tailSize = Math.min(1200, size);
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

  recordClientCrash(fullAccountJSON, { code, error, signal }) {
    this._appendCrashToHistory(fullAccountJSON, { code, error, signal });

    // We now let crashpad do this, because Sentry was losing it's mind.
  }

  _keyFor({ id, settings }) {
    return JSON.stringify({ id, settings });
  }

  _appendCrashToHistory(fullAccountJSON, { code = 0, error, signal } = {}) {
    const key = this._keyFor(fullAccountJSON);
    if (code === null) {
      console.log('mailsync crashed');
      AppEnv.reportError(new Error(`mailsync crashed for account: ${key}`));
    } else {
      console.log('mailsync exited');
      AppEnv.reportWarning(
        new Error(
          `mailsync existed with code: ${code}, error: ${error}, signal: ${signal} for account: ${key}`
        )
      );
    }
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
  constructor() {
    if (!AppEnv.isMainWindow() || AppEnv.inSpecMode()) {
      ipcRenderer.on('mailsync-bridge-message', this._onIncomingRebroadcastMessage);
      return;
    }

    Actions.queueTask.listen(this._onQueueTask, this);
    Actions.queueTasks.listen(this._onQueueTasks, this);
    Actions.cancelTask.listen(this._onCancelTask, this);
    Actions.fetchBodies.listen(this._onFetchBodies, this);
    Actions.fetchAttachments.listen(this._onFetchAttachments, this);
    Actions.syncFolders.listen(this._onSyncFolders, this);
    Actions.setObservableRange.listen(this._onSetObservableRange, this);
    Actions.debugFakeNativeMessage.listen(this.fakeEmit, this);
    Actions.forceKillAllClients.listen(this.forceKillClients, this);
    ipcRenderer.on('mailsync-config', this._onMailsyncConfigUpdate);
    ipcRenderer.on('thread-new-window', this._onNewWindowOpened);
    // ipcRenderer.on('thread-close-window', this._onNewWindowClose);

    this._crashTracker = new CrashTracker();
    this._clients = {};
    this._clientsStartTime = {};
    this._fetchBodiesCacheTTL = 30000;
    this._fetchAttachmentCacheTTL = 60000;
    this._cachedFetchBodies = {};
    this._cachedFetchAttachments = {};
    this._setObservableRangeTimer = {};
    this._cachedObservableThreadIds = {};
    this._cachedObservableMessageIds = {};
    this._cachedObservableTTL = 30000;
    // Store threads that are opened in seperate window
    this._additionalObservableThreads = {};
    this._analyzeDBTimer = null;

    if (AppEnv.isMainWindow()) {
      Actions.analyzeDB.listen(this.analyzeDataBase, this);
      this._analyzeDBTimer = setTimeout(this.analyzeDataBase, 5000);
    }

    AccountStore.listen(this.ensureClients, this);
    OnlineStatusStore.listen(this._onOnlineStatusChanged, this);

    AppEnv.onBeforeUnload(this._onBeforeUnload);
    AppEnv.onReadyToUnload(this._onReadyToUnload);

    process.nextTick(() => {
      console.log('constructor launching clients');
      this.ensureClients('constructor');
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
    let message = 'Thank you for helping debug EdisonMail. EdisonMail will now restart.';
    let phrase = 'disabled';

    if (AppEnv.config.get(VERBOSE_UNTIL_KEY)) {
      AppEnv.config.set(VERBOSE_UNTIL_KEY, 0);
    } else {
      AppEnv.config.set(VERBOSE_UNTIL_KEY, Date.now() + 30 * 60 * 1000);
      phrase = 'enabled';
      message =
        `Verbose logging will be enabled for the next thirty minutes. This records ` +
        `all network traffic to your mail providers and will be quite slow. Restart EdisonMail ` +
        `and wait for your problem to occur, and then submit mailsync-***.log files located ` +
        `in the directory: \n\n${configDirPath}.\n\nEdisonMail will now restart.`;
    }
    AppEnv.showErrorDialog({
      title: `Verbose logging is now ${phrase}`,
      message,
    });
    remote.app.relaunch();
    remote.app.quit();
  }

  clients() {
    return this._clients;
  }

  ensureClients = _.throttle(kind => {
    if (this._noRelaunch) {
      console.log('no relaunch of clients');
      return;
    }
    console.log(`ensuring account ${kind}`);
    const clientsWithoutAccounts = Object.assign({}, this._clients);

    for (const acct of AccountStore.accounts()) {
      if (!this._clients[acct.id]) {
        // client for this account is missing, launch it!
        this._launchClient(acct);
      } else {
        // client for this account exists
        delete clientsWithoutAccounts[acct.id];
      }
    }

    // Any clients left in the `clientsWithoutAccounts` after we looped
    // through and deleted one for each accountId are ones representing
    // deleted accounts.
    for (const client of Object.values(clientsWithoutAccounts)) {
      let id = '';
      if (client._proc && client._proc.pid) {
        id = client._proc.pid;
      }
      client.kill();
      if (!kind) {
        AppEnv.debugLog(`@pid ${id} kind is missing value in ensureClients`);
      }
      AppEnv.debugLog(`pid@${id} mailsync-bridge ensureClients: ${kind}`);
    }
  }, 100);

  forceKillClients() {
    if (!AppEnv.isMainWindow()) {
      return;
    }
    this._noRelaunch = true;
    for (const client of Object.values(this.clients())) {
      if (client) {
        if (client._proc && client._proc.pid) {
          const id = client._proc.pid;
          AppEnv.logWarning(`\n\n@pid ${id} was forced to die, it shall not re-spawn\n\n`);
          client.kill();
        }
      }
    }
    ipcRenderer.send('command', 'application:reset-database', {});
  }

  forceRelaunchClient(account) {
    this._launchClient(account, { force: true });
  }
  tmpKillClient(account) {
    if (!AppEnv.isMainWindow()) {
      return;
    }
    if (!this._tmpNoRelaunch) {
      this._tmpNoRelaunch = {};
    }
    const client = this.clients()[account.id];
    if (client) {
      if (client._proc && client._proc.pid) {
        const id = client._proc.pid;
        this._tmpNoRelaunch[account.id] = true;
        AppEnv.logWarning(`\n\n@pid ${id} was forced to die, entering one time re-spawn\n\n`);
        client.kill();
      }
    }
  }

  analyzeDataBase = () => {
    if (!AppEnv.isMainWindow()) {
      return;
    }
    const analyzeOptions = AppEnv.config.get('analyzeDBOptions') || {};
    const {
      lastAnalyzed = 0,
      analyzeInterval = MAX_ANALYZE_INTERVAL,
      checkInterval = ANALYZE_CHECK_INTERVAL,
    } = analyzeOptions;
    if (Date.now() - lastAnalyzed >= analyzeInterval) {
      const accountIds = Object.keys(this._clients);
      if (accountIds.length > 0) {
        const task = new AnalyzeDBTask({ accountId: accountIds[0] });
        this._onQueueTask(task);
        AppEnv.config.set('analyzeDBOptions', {
          lastAnalyzed: Date.now(),
          analyzeInterval,
          checkInterval,
        });
      }
    }
    this._analyzeDBTimer = setTimeout(this.analyzeDataBase, checkInterval);
  };

  sendSyncMailNow(accountId) {
    if (accountId) {
      if (this._clients && this._clients[accountId]) {
        this._clients[accountId].sendMessage({ type: 'wake-workers' });
      }
    } else {
      if (this._clients) {
        console.warn('Sending `wake` to all mailsync workers...');
        for (const client of Object.values(this._clients)) {
          client.sendMessage({ type: 'wake-workers' });
        }
      }
    }
  }

  async sendMessageToAccount(accountId, json) {
    if (!AccountStore.accountForId(accountId)) {
      return;
    }
    if (!this._clients[accountId]) {
      const account = AccountStore.accountForId(accountId) || {};
      const emailAddress = account.emailAddress;
      if (emailAddress) {
        const fullAccountJSON = (await KeyManager.insertAccountSecrets(account)).toJSON();
        if (this._crashTracker.tooManyFailures(fullAccountJSON)) {
          delete this._clientsStartTime[account.id];
          Actions.updateAccount(account.id, {
            syncState: Account.SYNC_STATE_ERROR,
            syncError: null,
          });
          return;
        } else {
          this.ensureClients('sendMessageToAccount');
        }
      } else {
        return AppEnv.showErrorDialog({
          title: `EdisonMail is unable to sync `,
          message: `In order to perform actions on this mailbox, you need to resolve the sync issue. Visit Preferences > Accounts for more information.`,
        });
      }
    }
    if (!this._clients[accountId].isSyncReadyToReceiveMessage()) {
      const { emailAddress } = AccountStore.accountForId(accountId) || {};
      console.log(
        `sync is not ready, initial message not send to native yet. Message for account ${emailAddress} not send`
      );
      this._clients[accountId].appendToSendQueue(json);
      return;
    }
    this._clients[accountId].sendMessage(json);
  }

  async resetCacheForAccount(account, { silent } = {}) {
    // grab the existing client, if there is one
    const syncingClient = this._clients[account.id];
    if (syncingClient) {
      // mark client as removing;
      syncingClient.isRemoving = true;
      let id = '';
      if (syncingClient._proc && syncingClient._proc.pid) {
        id = syncingClient._proc.pid;
      }
      syncingClient.kill();
      AppEnv.debugLog(`pid @ ${id} mailsync-bridge resetCacheForAccount`);
      delete this._clients[account.id];
      delete this._clientsStartTime[account.id];
    }

    // create a new client that will perform the reset
    const resetClient = new MailsyncProcess(this._getClientConfiguration());
    resetClient.account = (await KeyManager.insertAccountSecrets(account)).toJSON();
    resetClient.identity = IdentityStore.identity();
    resetClient.isRemoving = true;

    // no-op - do not allow us to kill this client - we may be reseting the cache of an
    // account which does not exist anymore, but we don't want to interrupt this process
    resetClient.kill = () => {};

    this._clients[account.id] = resetClient;

    // kill the old client, ensureClients will be a no-op because the
    // client has already been replaced in our lookup table.

    if (!silent) {
      AppEnv.showErrorDialog({
        title: `Cleanup Started`,
        message: `EdisonMail is clearing it's cache for ${account.emailAddress}. Depending on the size of the mailbox, this may take a few seconds or a few minutes. An alert will appear when cleanup is complete.`,
      });
    }

    try {
      const start = Date.now();

      await resetClient.resetCache();

      if (!silent) {
        AppEnv.showErrorDialog({
          title: `Cleanup Complete`,
          message: `EdisonMail reset the local cache for ${account.emailAddress} in ${Math.ceil(
            (Date.now() - start) / 1000
          )} seconds. Your mailbox will now begin to sync again.`,
        });
      }
    } catch (error) {
      AppEnv.showErrorDialog({
        title: `Cleanup Error`,
        message: `EdisonMail was unable to reset the local cache. ${error}`,
      });
    } finally {
      delete this._clients[account.id];
      delete this._clientsStartTime[account.id];
      process.nextTick(() => {
        this.ensureClients('resetCacheForAccount');
      });
    }
  }

  fakeEmit(msgs) {
    this._onIncomingMessages(msgs);
  }
  fakeTask(task) {
    this.sendMessageToAccount(task.accountId || task.aid, { type: 'queue-task', task: task });
  }

  // Private

  _getClientConfiguration(account) {
    const { configDirPath, resourcePath } = AppEnv.getLoadSettings();
    const verboseUntil = AppEnv.config.get(VERBOSE_UNTIL_KEY) || 0;
    const verbose = verboseUntil && verboseUntil / 1 > Date.now();
    if (verbose) {
      console.warn(`Verbose mailsync logging is enabled until ${new Date(verboseUntil)}`);
    }
    return { configDirPath, resourcePath, verbose };
  }

  async _launchClient(account, { force } = {}) {
    if (this._tmpNoRelaunch && account && this._tmpNoRelaunch[account.id]) {
      delete this._tmpNoRelaunch[account.id];
      AppEnv.logWarning(
        `No launch client because of one time launch deny on account: ${account.id}`
      );
      return;
    }
    const client = new MailsyncProcess(this._getClientConfiguration());
    this._clients[account.id] = client; // set this synchornously so we never spawn two
    this._clientsStartTime[account.id] = Date.now();
    delete this._setObservableRangeTimer[account.id];
    delete this._cachedObservableThreadIds[account.id];
    delete this._cachedObservableMessageIds[account.id];
    delete this._additionalObservableThreads[account.id];
    delete this._cachedFetchAttachments[account.id];
    delete this._cachedFetchBodies[account.id];
    const fullAccountJSON = (await KeyManager.insertAccountSecrets(account)).toJSON();

    if (force) {
      this._crashTracker.forgetCrashes(fullAccountJSON);
    } else if (this._crashTracker.tooManyFailures(fullAccountJSON)) {
      delete this._clients[account.id];
      delete this._clientsStartTime[account.id];
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
      delete this._clientsStartTime[account.id];
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
        this.ensureClients('_launchClient');
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
      try {
        AppEnv.reportError(new Error(`Task ${task.constructor.name} have no id`), {
          errorData: {
            task: task.toJSON(),
            account: JSON.stringify(AccountStore.accountsForErrorLog()),
          },
        });
      } catch (e) {
        console.log(e);
      }
      throw new Error(
        'Tasks must have an ID prior to being queued. Check that your Task constructor is calling `super`'
      );
    }
    if (!task.accountId) {
      try {
        AppEnv.reportError(new Error(`Task ${task.constructor.name} have no accountId`), {
          errorData: {
            task: task.toJSON(),
            account: JSON.stringify(AccountStore.accountsForErrorLog()),
          },
        });
      } catch (e) {
        console.log(e);
      }
      throw new Error(
        `Tasks must have an accountId. Check your instance of ${task.constructor.name}.`
      );
    }
    if (task.needToBroadcastBeforeSendTask) {
      if (
        task.needToBroadcastBeforeSendTask.channel &&
        task.needToBroadcastBeforeSendTask.options
      ) {
        // Because we are using sync call, make sure the listener is very short
        console.log('Making sync call, this better be time sensitive operation');
        if (!this._clients[task.accountId]) {
          console.log('client is already dead, we are ignoring this sync call');
          return;
        }
        ipcRenderer.sendSync(`mainProcess-sync-call`, task.needToBroadcastBeforeSendTask);
      }
    }

    task.willBeQueued();

    task.status = 'local';
    task.origin = new Error().stack
      .split('\n')
      .slice(2)
      .join('\n');

    // AppEnv.trackingTask(task);
    this.sendMessageToAccount(task.accountId, { type: 'queue-task', task: task });
  }

  _onQueueTasks(tasks) {
    if (!tasks || !tasks.length) {
      return;
    }
    for (const task of tasks) {
      if (task) {
        this._onQueueTask(task);
      }
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
        AppEnv.logWarning(`Sync worker sent non-JSON formatted message: ${msg}`);
        continue;
      }

      let json = null;
      try {
        json = JSON.parse(msg);
      } catch (err) {
        AppEnv.logWarning(`Sync worker sent non-JSON formatted message: ${msg}. ${err}`);
        continue;
      }

      let { type, modelJSONs, modelClass } = json;
      if (!modelJSONs || !type || !modelClass) {
        AppEnv.logWarning(`Sync worker sent a JSON formatted message with unexpected keys: ${msg}`);
        continue;
      }

      // if ErrorAuthentication
      modelJSONs = modelJSONs.filter(data => {
        if (data.key && data.key === 'ErrorAuthentication') {
          Actions.updateAccount(data.aid, {
            syncState: Account.SYNC_STATE_AUTH_FAILED,
            syncError: null,
          });
          console.error('ErrorAuthentication', data);
          return false;
        }
        return true;
      });

      // dispatch the message to other windows
      ipcRenderer.send('mailsync-bridge-rebroadcast-to-all', msg);
      if (AppEnv.enabledFromNativeLog) {
        console.log('----------------From native-------------------');
        AppEnv.logDebug(`from native : ${msg}`);
        console.log('---------------------From native END------------------------');
      }
      const models = modelJSONs.map(Utils.convertToModel);
      this._onIncomingChangeRecord(
        new DatabaseChangeRecord({
          type, // TODO BG move to "model" naming style, finding all uses might be tricky
          objectClass: modelClass,
          objects: models,
        })
      );
    }
  };
  _recordErrorToConsole = task => {
    const warningKeys = ['ErrorConnection', 'ErrorAuthentication'];
    let errorAccount = {};
    if (task && task.accountId) {
      const accounts = AppEnv.config.get('accounts');
      if (Array.isArray(accounts)) {
        for (let acc of accounts) {
          if (acc.id === task.aid || acc.id === task.accountId) {
            errorAccount = AppEnv.anonymizeAccount(acc);
            break;
          }
        }
      }
    }
    if (task) {
      if (task.error && task.error.retryable) {
        AppEnv.reportWarning(
          new Error(
            `TaskError: account-> ${JSON.stringify(errorAccount)} task-> ${JSON.stringify(task)}`
          )
        );
      } else if (task.error && task.error.key && warningKeys.includes(task.error.key)) {
        AppEnv.reportWarning(
          new Error(
            `TaskError: account-> ${JSON.stringify(errorAccount)} task-> ${JSON.stringify(task)}`
          )
        );
      } else {
        AppEnv.reportError(
          new Error(
            `TaskError: account-> ${JSON.stringify(errorAccount)} task-> ${JSON.stringify(task)}`
          )
        );
      }
    }
  };

  _onIncomingChangeRecord = record => {
    DatabaseStore.trigger(record);

    // Run task success / error handlers if the task is now complete
    // Note: cannot use `record.objectClass` because of subclass names
    if (record.type === 'persist' && record.objects[0] instanceof Task) {
      for (const task of record.objects) {
        if (task.error != null) {
          task.onError(task.error);
          this._recordErrorToConsole(task);
        }
        if (task.status !== 'complete') {
          continue;
        }
        if (task.error != null) {
          task.onError(task.error);
          this._recordErrorToConsole(task);
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
      })
    );
  };

  _observableCacheFilter({ accountId = null, missingIds = [], priority = 0 } = {}, dataCache, ttl) {
    if (!accountId) {
      return [];
    }
    const now = Date.now();
    const clientStartTime = this._clientsStartTime[accountId] || now - 1;
    if (!dataCache[accountId]) {
      dataCache[accountId] = [];
    }
    if (dataCache[accountId].length === 0) {
      for (const id of missingIds) {
        dataCache[accountId].push({ id: id, lastSend: now, priority });
      }
      return missingIds;
    } else {
      const missingIdsMap = missingIds.map(id => {
        return { id: id, isNew: true };
      });
      const missing = [];
      const newCache = [];
      for (let cache of dataCache[accountId]) {
        let cacheUpdated = false;
        for (let i = 0; i < missingIdsMap.length; i++) {
          if (missingIdsMap[i].id === cache.id) {
            if (now - cache.lastSend > ttl || cache.lastSend < clientStartTime) {
              cache.lastSend = now;
              cache.priority = priority;
              missing.push(cache.id);
            } else if (priority > cache.priority) {
              cache.lastSend = now;
              cache.priority = priority;
              missing.push(cache.id);
            }
            newCache.push(cache);
            cacheUpdated = true;
            missingIdsMap[i].isNew = false;
            break;
          }
        }
        if (now - cache.lastSend <= ttl && cache.lastSend > clientStartTime && !cacheUpdated) {
          newCache.push(cache);
        }
      }
      for (const idMap of missingIdsMap) {
        if (idMap.isNew) {
          newCache.push({ id: idMap.id, lastSend: now, priority });
          missing.push(idMap.id);
        }
      }
      dataCache[accountId] = newCache;
      return missing;
    }
  }

  _fetchCacheFilter({ accountId = null, missingIds = [], priority = 0 } = {}, dataCache, ttl) {
    if (!accountId) {
      return [];
    }
    const now = Date.now();
    const clientStartTime = this._clientsStartTime[accountId] || now - 1;
    if (!dataCache[accountId]) {
      dataCache[accountId] = [];
    }
    if (dataCache[accountId].length === 0) {
      for (const id of missingIds) {
        dataCache[accountId].push({ id: id, lastSend: now, priority });
      }
      return missingIds;
    } else {
      const missingIdsMap = missingIds.map(id => {
        return { id: id, isNew: true };
      });
      const missing = [];
      const newCache = [];
      for (let cache of dataCache[accountId]) {
        let cacheUpdated = false;
        for (let i = 0; i < missingIdsMap.length; i++) {
          if (missingIdsMap[i].id === cache.id) {
            if (cache.lastSend < clientStartTime) {
              cache.lastSend = now;
              cache.priority = priority;
              missing.push(cache.id);
            } else if (priority > cache.priority || priority === 0) {
              cache.lastSend = now;
              cache.priority = priority;
              missing.push(cache.id);
            }
            newCache.push(cache);
            cacheUpdated = true;
            missingIdsMap[i].isNew = false;
            break;
          }
        }
        if (cache.lastSend > clientStartTime && !cacheUpdated) {
          newCache.push(cache);
        }
      }
      for (const idMap of missingIdsMap) {
        if (idMap.isNew) {
          newCache.push({ id: idMap.id, lastSend: now, priority });
          missing.push(idMap.id);
        }
      }
      dataCache[accountId] = newCache;
      return missing;
    }
  }

  _onFetchAttachments({ accountId, missingItems }) {
    const ids = this._fetchAttachmentCacheFilter({ accountId, missingItems });
    if (ids.length > 0) {
      this.sendMessageToAccount(accountId, {
        type: 'need-attachments',
        ids: ids,
      });
    }
  }

  _fetchAttachmentCacheFilter({ accountId = null, missingItems = [] } = {}) {
    return this._fetchCacheFilter(
      { accountId, missingIds: missingItems },
      this._cachedFetchAttachments,
      this._fetchAttachmentCacheTTL
    );
  }

  _onFetchBodies({ messages = [], source = 'message' } = {}) {
    const messagesByAccountId = this._sortMessagesByAccount({ messages });
    let priority = 0;
    if (source === 'draft') {
      priority = 2;
    } else if (source === 'message') {
      priority = 1;
    }
    for (const accountId of Object.keys(messagesByAccountId)) {
      const ids = this._fetchBodiesCacheFilter({
        accountId,
        messages: messagesByAccountId[accountId],
        priority,
      });
      if (ids.length > 0) {
        this.sendMessageToAccount(accountId, {
          type: 'need-bodies',
          ids: ids,
          source,
        });
      }
    }
  }

  _onMailsyncConfigUpdate = (event, mailsyncConfig = null) => {
    if (!mailsyncConfig) {
      const defaultSettings = AppEnv.config.get('core.mailsync');
      const accounts = AppEnv.config.get('accounts');
      if (!Array.isArray(accounts) || accounts.length === 0) {
        return;
      }
      mailsyncConfig = {};
      for (let account of accounts) {
        if (account.mailsync) {
          mailsyncConfig[account.id] = Object.assign({}, defaultSettings, account.mailsync);
        } else {
          mailsyncConfig[account.id] = Object.assign({}, defaultSettings);
        }
      }
    }
    for (const accountId of Object.keys(this._clients)) {
      if (mailsyncConfig[accountId]) {
        this.sendMessageToAccount(accountId, {
          type: 'config-change',
          settings: mailsyncConfig[accountId],
        });
      }
    }
  };

  _sortMessagesByAccount({ messages = [] } = {}) {
    const byAccount = {};
    for (const msg of messages) {
      if (!byAccount[msg.accountId]) {
        byAccount[msg.accountId] = [];
      }
      byAccount[msg.accountId].push(msg);
    }
    return byAccount;
  }

  _fetchBodiesCacheFilter({ accountId, messages = [], priority = 0 } = {}) {
    return this._fetchCacheFilter(
      {
        accountId,
        missingIds: messages.map(m => m.id),
        priority,
      },
      this._cachedFetchBodies,
      this._fetchBodiesCacheTTL
    );
  }

  _onNewWindowOpened = (event, options) => {
    if (options.threadId && options.accountId && this._clients[options.accountId]) {
      this._onSetObservableRange(options.accountId, {
        missingThreadIds: [options.threadId],
        missingMessageIds: [],
      });
    }
  };

  _onSetObservableRange = (accountId, { missingThreadIds = [], missingMessageIds = [] } = {}) => {
    if (!this._clients[accountId]) {
      //account doesn't exist, we clear observable cache
      delete this._setObservableRangeTimer[accountId];
      delete this._cachedObservableThreadIds[accountId];
      delete this._cachedObservableMessageIds[accountId];
      return;
    }
    if (this._setObservableRangeTimer[accountId]) {
      if (Date.now() - this._setObservableRangeTimer[accountId].timestamp > 1000) {
        const threadIds = this._observableCacheFilter(
          { accountId, missingIds: missingThreadIds },
          this._cachedObservableThreadIds,
          this._cachedObservableTTL
        );
        const messageIds = this._observableCacheFilter(
          { accountId, missingIds: missingMessageIds },
          this._cachedObservableMessageIds,
          this._cachedObservableTTL
        );
        if (threadIds.length === 0 && messageIds.length === 0) {
          return;
        }
        const tmpTask = new SetObservableRangeTask({ accountId, threadIds, messageIds });
        this._setObservableRangeTimer[accountId].timestamp = Date.now();
        // DC-46
        // We call sendMessageToAccount last on the off chance that mailsync have died,
        // we want to avoid triggering client.kill() before setting observable cache
        this.sendMessageToAccount(accountId, tmpTask.toJSON());
      } else {
        clearTimeout(this._setObservableRangeTimer[accountId].id);
        this._setObservableRangeTimer[accountId] = {
          id: setTimeout(() => {
            const threadIds = this._observableCacheFilter(
              { accountId, missingIds: missingThreadIds },
              this._cachedObservableThreadIds,
              this._cachedObservableTTL
            );
            const messageIds = this._observableCacheFilter(
              { accountId, missingIds: missingMessageIds },
              this._cachedObservableMessageIds,
              this._cachedObservableTTL
            );
            if (threadIds.length === 0 && messageIds.length === 0) {
              return;
            }
            const tmpTask = new SetObservableRangeTask({ accountId, threadIds, messageIds });
            this.sendMessageToAccount(accountId, tmpTask.toJSON());
          }, 1000),
          timestamp: Date.now(),
        };
      }
    } else {
      this._setObservableRangeTimer[accountId] = {
        id: setTimeout(() => {
          const threadIds = this._observableCacheFilter(
            { accountId, missingIds: missingThreadIds },
            this._cachedObservableThreadIds,
            this._cachedObservableTTL
          );
          const messageIds = this._observableCacheFilter(
            { accountId, missingIds: missingMessageIds },
            this._cachedObservableMessageIds,
            this._cachedObservableTTL
          );
          if (threadIds.length === 0 && messageIds.length === 0) {
            return;
          }
          const tmpTask = new SetObservableRangeTask({ accountId, threadIds, messageIds });
          this.sendMessageToAccount(accountId, tmpTask.toJSON());
        }, 1000),
        timestamp: Date.now(),
      };
    }
  };

  _onSyncFolders({ accountId, foldersIds } = {}) {
    if (Array.isArray(foldersIds) && accountId) {
      this.sendMessageToAccount(accountId, {
        type: 'sync-folders',
        aid: accountId,
        ids: foldersIds,
      });
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
      let id = '';
      if (client._proc && client._proc.pid) {
        id = client._proc.pid;
      }
      client.kill();
      AppEnv.debugLog(`pid@${id} mailsync-bridge _onReadyToUnload: page refresh`);
    }
    this._clients = {};
  };

  _onOnlineStatusChanged = ({ onlineDidChange, wakingFromSleep }) => {
    if (wakingFromSleep || (onlineDidChange && OnlineStatusStore.isOnline())) {
      this.sendSyncMailNow();
    }
  };
}
