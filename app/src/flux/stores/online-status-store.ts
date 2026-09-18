import MailspringStore from 'mailspring-store';
import _ from 'underscore';

const MTC_CHECK_INTERVAL = 1000 * 60 * 5;
const MTC_LATE_THRESHOLD = 1000 * 60;

// maybe more in the future. We currently store most sync /progress/ on
// the individual folders in the account (FolderSyncProgressStore)

class OnlineStatusStore extends MailspringStore {
  _interval = null;
  _offlineProcesses: { [accountId: string]: boolean } = {};
  _timeoutTargetTime = null;

  constructor() {
    super();

    // Schedule a JS interval and then check to make sure it fires at the time
    // we asked for. If it's "late", we probably went to sleep and are waking.
    // We can restart the sync workers immediately since they're likely back online.
    // The main process also forwards `powerMonitor`'s resume event, which is both
    // faster and more reliable than this; the interval remains as a fallback for
    // platforms where that event never arrives.
    if (AppEnv.isMainWindow()) {
      this._timeoutTargetTime = Date.now() + MTC_CHECK_INTERVAL;
      setInterval(() => {
        if (Date.now() > this._timeoutTargetTime + MTC_LATE_THRESHOLD) {
          this.onMayBeOnline();
        }
        this._timeoutTargetTime = Date.now() + MTC_CHECK_INTERVAL;
      }, MTC_CHECK_INTERVAL);
    }
  }

  isOnline() {
    return Object.keys(this._offlineProcesses).length === 0;
  }

  offlineAccountIds() {
    return Object.keys(this._offlineProcesses);
  }

  onSyncProcessStateReceived = ({
    accountId,
    connectionError,
  }: {
    accountId: string;
    connectionError: boolean;
  }) => {
    if (connectionError && !this._offlineProcesses[accountId]) {
      console.warn(`Account ${accountId}: offline`);
      this._offlineProcesses[accountId] = true;
      this.trigger();
    } else if (!connectionError && this._offlineProcesses[accountId]) {
      console.warn(`Account ${accountId}: online`);
      delete this._offlineProcesses[accountId];
      this.onMayBeOnline();
      this.trigger();
    }
  };

  // A sync process that has exited cannot tell us it reconnected: a replacement
  // process starts out believing it is online and only emits ProcessState when its
  // connection state /changes/, so it never sends the `connectionError: false` that
  // would clear this account. Without this, a crash, a cache rebuild or a removed
  // account leaves the app showing "connection issues" until it is restarted.
  onSyncProcessStopped = (accountId: string) => {
    if (!this._offlineProcesses[accountId]) {
      return;
    }
    console.warn(`Account ${accountId}: sync process stopped, clearing offline state`);
    delete this._offlineProcesses[accountId];
    this.trigger();
  };

  onMayBeOnline = _.throttle(() => {
    AppEnv.mailsyncBridge.sendSyncMailNow();
  }, 3000);
}

export default new OnlineStatusStore();
