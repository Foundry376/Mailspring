import MailspringStore from 'mailspring-store';
import _ from 'underscore';

class OnlineUserStore extends MailspringStore {
  constructor() {
    super();
    this.onlineUsers = {};
    this.onlineAccounts = {};
    this.allSelfAccounts = {};
    this._triggerDebounced = _.debounce(() => this.trigger(), 20);
  }

  addSelfAccount(jid, account) {
    this.allSelfAccounts[jid] = account;
  }

  getSelfAccountById(jid) {
    return this.allSelfAccounts[jid];
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
    this.onlineAccounts[payload.bare] = 1;
    this._triggerDebounced();
  }

  removeOnLineAccount() {
    this.onlineAccounts = {};
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
