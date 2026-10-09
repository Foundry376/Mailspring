import MailspringStore from 'mailspring-store';
import { ipcRenderer } from 'electron';
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
    if (AppEnv.isMainWindow()) {
      this._timeoutTargetTime = Date.now() + MTC_CHECK_INTERVAL;
      setInterval(() => {
        if (Date.now() > this._timeoutTargetTime + MTC_LATE_THRESHOLD) {
          this.onMayBeOnline();
        }
        this._timeoutTargetTime = Date.now() + MTC_CHECK_INTERVAL;
      }, MTC_CHECK_INTERVAL);

      // Without these the engine notices a returned network only when its 120s retry
      // wait runs out.
      window.addEventListener('online', () => this.onMayBeOnline());
      ipcRenderer.on('system-resumed', () => this.onMayBeOnline());
    }
  }

  isOnline() {
    return Object.keys(this._offlineProcesses).length === 0;
  }

  isAccountOnline(accountId: string) {
    return !this._offlineProcesses[accountId];
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

  // A relaunched mailsync process starts out believing it is online and only reports
  // the end of a connection error it saw itself, so state from the exited process
  // would otherwise never clear.
  onSyncProcessExited = (accountId: string) => {
    if (this._offlineProcesses[accountId]) {
      delete this._offlineProcesses[accountId];
      this.trigger();
    }
  };

  onMayBeOnline = _.throttle(() => {
    AppEnv.mailsyncBridge.sendSyncMailNow();
  }, 3000);
}

export default new OnlineStatusStore();
