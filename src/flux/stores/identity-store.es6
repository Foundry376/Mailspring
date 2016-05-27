import NylasStore from 'nylas-store';
import Actions from '../actions';
import keytar from 'keytar';
import {ipcRenderer} from 'electron';
import request from 'request';

const configIdentityKey = "nylas.identity";
const keytarServiceName = 'Nylas';
const keytarIdentityKey = 'Nylas Account';
const URLRoot = "https://billing-staging.nylas.com";

class IdentityStore extends NylasStore {

  constructor() {
    super();

    // TODO
    this._trialDaysRemaining = 14

    this.listenTo(Actions.setNylasIdentity, this._onSetNylasIdentity);
    this.listenTo(Actions.logoutNylasIdentity, this._onLogoutNylasIdentity);

    NylasEnv.config.onDidChange(configIdentityKey, () => {
      this._loadIdentity();
      this.trigger();
    });
    this._loadIdentity();

    if (NylasEnv.isWorkWindow() && ['staging', 'production'].includes(NylasEnv.config.get('env'))) {
      setInterval(this.refreshStatus, 1000 * 60 * 60);
      this.refreshStatus();
    }
  }

  _loadIdentity() {
    this._identity = NylasEnv.config.get(configIdentityKey);
    if (this._identity) {
      this._identity.token = keytar.getPassword(keytarServiceName, keytarIdentityKey);
    }
  }

  get URLRoot() {
    return URLRoot;
  }

  identity() {
    return this._identity;
  }

  trialDaysRemaining() {
    return 14;
  }

  refreshStatus = () => {
    request({
      method: 'GET',
      url: `${this.URLRoot}/n1/user`,
      auth: {
        username: this._identity.token,
        password: '',
        sendImmediately: true,
      },
    }, (error, response = {}, body) => {
      if (response.statusCode === 200) {
        try {
          const nextIdentity = Object.assign({}, this._identity, JSON.parse(body));
          this._onSetNylasIdentity(nextIdentity)
        } catch (err) {
          NylasEnv.reportError("IdentityStore.refreshStatus: invalid JSON in response body.")
        }
      }
    });
  }

  fetchSingleSignOnURL(path) {
    if (!this._identity) {
      return Promise.reject(new Error("fetchSingleSignOnURL: no identity set."));
    }

    if (!path.startsWith('/')) {
      return Promise.reject(new Error("fetchSingleSignOnURL: path must start with a leading slash."));
    }

    return new Promise((resolve) => {
      request({
        method: 'POST',
        url: `${this.URLRoot}/n1/login-link`,
        json: true,
        body: {
          next_path: path,
          account_token: this._identity.token,
        },
      }, (error, response = {}, body) => {
        if (error || !body.startsWith('http')) {
          // Single-sign on attempt failed. Rather than churn the user right here,
          // at least try to open the page directly in the browser.
          resolve(`${this.URLRoot}${path}`);
        } else {
          resolve(body);
        }
      });
    });
  }

  _onLogoutNylasIdentity = () => {
    keytar.deletePassword(keytarServiceName, keytarIdentityKey);
    NylasEnv.config.unset(configIdentityKey);
    ipcRenderer.send('command', 'application:relaunch-to-initial-windows');
  }

  _onSetNylasIdentity = (identity) => {
    keytar.replacePassword(keytarServiceName, keytarIdentityKey, identity.token);
    delete identity.token;
    NylasEnv.config.set(configIdentityKey, identity);
  }
}

export default new IdentityStore()
