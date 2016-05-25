import NylasStore from 'nylas-store';
import Actions from '../actions';
import keytar from 'keytar';
import {ipcRenderer} from 'electron';

const configIdentityKey = "nylas.identity";
const keytarServiceName = 'Nylas';
const keytarIdentityKey = 'Nylas Account';

class IdentityStore extends NylasStore {

  constructor() {
    super();

    this.URLRoot = "https://billing-staging.nylas.com";

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

  identity() {
    return this._identity;
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
