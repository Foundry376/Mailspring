import MailspringStore from 'mailspring-store';
import Actions from '../actions';
import AppMessageStore from './app-message-store';

const messageBlock = {
  id: 'online-offline',
  description: 'Edison Mail is offline. Please check your network connection.',
  icon: 'no-network.svg',
  delayDuration: 0,
  allowClose: false,
  priority: 0,
  actions: [],
};

class OnlineStatusStore extends MailspringStore {
  constructor() {
    super();
    this._online = navigator.onLine;
    if (AppEnv.isMainWindow()) {
      window.addEventListener('online', this._onlineStatusChange);
      window.addEventListener('offline', this._onlineStatusChange);
      if(!this._online){
        // Because at this point, store listening is not setup
        AppMessageStore._onQueue(messageBlock);
      }
    }
  }

  _onlineStatusChange = () => {
    const previousStatus = this._online;
    this._online = navigator.onLine;
    if (previousStatus !== this._online) {
      if (this._online) {
        Actions.removeAppMessage(messageBlock);
      } else {
        Actions.pushAppMessage(messageBlock);
      }
    }
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
