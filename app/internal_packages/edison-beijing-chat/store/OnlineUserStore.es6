import MailspringStore from 'mailspring-store';
import _ from 'underscore';
import { log } from '../utils/log-util';

class OnlineUserStore extends MailspringStore {
  constructor() {
    super();
    this.authingAccounts = {};
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
    const jid = payload.from && payload.from.bare || payload.bare;
    log(`addOnLineAccount: ${jid}`);
    this.onlineAccounts[jid] = 1;
    this.authingAccounts[jid] = 0;
    this._triggerDebounced();
  }

  addAuthingAccount(jid) {
    this.authingAccounts[jid] = 1;
    this._triggerDebounced();
  }

  removeAuthingAccount(jid) {
    this.authingAccounts[jid] = 0;
    this._triggerDebounced();
  }

  removeOnLineAccount(data) {
    this.authingAccounts[data.curJid] = 0;
    this.authingAccounts = {};
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
