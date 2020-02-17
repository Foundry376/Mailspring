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

  onSyncProcessStateReceived = ({
    accountId,
    connectionError,
  }: {
    accountId: string;
    connectionError: boolean;
  }) => {
    const prevIsOnline = this.isOnline();

    if (connectionError && !this._offlineProcesses[accountId]) {
      console.warn(`Account ${accountId}: offline`);
      this._offlineProcesses[accountId] = true;
    } else if (!connectionError && this._offlineProcesses[accountId]) {
      console.warn(`Account ${accountId}: online`);
      delete this._offlineProcesses[accountId];
      this.onMayBeOnline();
    }

    if (prevIsOnline !== this.isOnline()) {
      this.trigger();
    }
  };

  onMayBeOnline = _.throttle(() => {
    AppEnv.mailsyncBridge.sendSyncMailNow();
  }, 3000);
}

export default new OnlineStatusStore();
