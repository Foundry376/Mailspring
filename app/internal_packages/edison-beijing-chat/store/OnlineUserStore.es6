import MailspringStore from 'mailspring-store';
import _ from 'underscore';

class OnlineUserStore extends MailspringStore {
  constructor() {
    super();
    this.onlineUsers = {};
    this.onLineAccounts = {};
    this._triggerDebounced = _.debounce(() => this.trigger(), 20);
  }

  addOnlineUser(payload) {
    this.onlineUsers[payload.from.bare] = 1;
    this._triggerDebounced();
  }

  removeOnlineUser(payload) {
    this.onlineUsers[payload.from.bare] = 0;
    this._triggerDebounced();
  }

  addOnLineAccount(payload) {
    this.onLineAccounts[payload.bare] = 1;
    this._triggerDebounced();
  }

  removeOnLineAccount(payload) {
    this.onLineAccounts[payload.curJid] = 0;
    this.resetOnlineUsers();
    this._triggerDebounced();
  }

  resetOnlineUsers() {
    this.onlineUsers = {};
    this._triggerDebounced();
  }

  isUserOnline(jid) {
    return this.onlineUsers[jid];
  }
}

module.exports = new OnlineUserStore();
