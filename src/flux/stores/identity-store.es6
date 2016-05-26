import NylasStore from 'nylas-store';
import Actions from '../actions';
import keytar from 'keytar';
import {ipcRenderer} from 'electron';

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
    return this._trialDaysRemaining;
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
