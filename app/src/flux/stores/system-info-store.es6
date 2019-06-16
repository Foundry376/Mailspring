import diskuasge from 'diskusage';
import MailspringStore from 'mailspring-store';
import Actions from '../actions';

class SystemInfoStore extends MailspringStore {
  constructor() {
    super();
    this._systemInfo = {
      diskStats: {
        availableInBytes: 0,
        totalInBytes: 0,
      },
    };
    this._lastChecked = {};
    this._timer = null;
    if (AppEnv.isMainWindow()) {
      this._checkDiskStats();
      this._timer = setInterval(this._checkDiskStats, 60 * 60 * 1000);
      Actions.updateLastSystemInfoCheck.listen(this._updateLastChecked, this);
    }
  }

  lastChecked(source) {
    return this._lastChecked[source] || 0;
  }

  diskStats() {
    return this._systemInfo.diskStats;
  }

  _updateLastChecked = ({ source = '' } = {}) => {
    if (source) {
      this._lastChecked[source] = Date.now();
      this.trigger({ source });
    }
  };

  _checkDiskStats = cb => {
    diskuasge.check(AppEnv.getConfigDirPath(), (err, info) => {
      if (err) {
        AppEnv.reportError(err);
      } else {
        this._systemInfo.diskStats = { totalInBytes: info.total, availableInBytes: info.available };
        if (cb) {
          cb(this._systemInfo);
        }
        this.trigger();
      }
    });
  };

  _mockDiskLow() {
    this._systemInfo.diskStats = { totalInBytes: 50000, availableInBytes: 1000 };
    this.trigger();
  }

}

export default new SystemInfoStore();
