import MailspringStore from 'mailspring-store';

class OnlineStatusStore extends MailspringStore {
  constructor() {
    super();
    this._online = navigator.onLine;
    if (AppEnv.isMainWindow()) {
      window.addEventListener('online', this._onlineStatusChange);
      window.addEventListener('offline', this._onlineStatusChange);
    }
  }

  _onlineStatusChange = () => {
    const previousStatus = this._online;
    this._online = navigator.onLine;
    this.trigger({
      onlineDidChange: true,
      wakingFromSleep: !previousStatus,
    });
  };

  isOnline() {
    return this._online;
  }

}

export default new OnlineStatusStore();
