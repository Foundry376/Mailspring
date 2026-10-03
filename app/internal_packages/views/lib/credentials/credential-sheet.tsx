import React from 'react';
import { shell } from 'electron';
import { Actions, localized } from 'mailspring-exports';
import { ViewCredential } from '../../../../src/browser/view-credential-policy';
import { installedViews, notifyViewsChanged } from '../view-registry';
import {
  declaredCredential,
  declaredCredentials,
  isConnected,
  removeCredential,
  saveCredential,
} from './store';

// A View names its own credential, so its label could claim to be a service it isn't. When the
// label or id mentions a well-known service but the bound hosts aren't that service's, the
// sheet says so before the user pastes a key.
const KNOWN_SERVICES: { [name: string]: string[] } = {
  github: ['github.com'],
  gitlab: ['gitlab.com'],
  salesforce: ['salesforce.com', 'force.com'],
  google: ['googleapis.com', 'google.com'],
  slack: ['slack.com'],
  stripe: ['stripe.com'],
  hubspot: ['hubapi.com', 'hubspot.com'],
  notion: ['notion.com', 'notion.so'],
  linear: ['linear.app'],
  openai: ['openai.com'],
  anthropic: ['anthropic.com'],
  clearbit: ['clearbit.com'],
  apollo: ['apollo.io'],
};

export function mismatchedService(credential: ViewCredential): string | null {
  const claim = `${credential.id} ${credential.label}`.toLowerCase();
  for (const [name, domains] of Object.entries(KNOWN_SERVICES)) {
    if (!claim.includes(name)) continue;
    const ok = credential.hosts.every((h) => {
      const host = h.replace(/^\*\./, '');
      return domains.some((d) => host === d || host.endsWith(`.${d}`));
    });
    if (!ok) return name;
  }
  return null;
}

function viewName(viewId: string) {
  const view = installedViews().find((v) => v.id === viewId);
  return view ? view.name : viewId;
}

interface ConnectProps {
  viewId: string;
  credential: ViewCredential;
  onDone: (connected: boolean) => void;
}

class ConnectCredential extends React.Component<ConnectProps, { secret: string; error: string }> {
  state = { secret: '', error: '' };

  _save = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const secret = this.state.secret.trim();
    if (!secret) return;
    try {
      await saveCredential(this.props.viewId, this.props.credential.id, secret);
      this.props.onDone(true);
    } catch (err) {
      this.setState({ error: err.message });
    }
  };

  render() {
    const { credential, viewId } = this.props;
    const mismatch = mismatchedService(credential);
    return (
      <form className="view-credential-sheet" onSubmit={this._save}>
        <h2>{localized('Connect %@', credential.label)}</h2>
        <p className="view-credential-intro">
          {localized('The “%@” View wants to make requests with your key.', viewName(viewId))}
        </p>
        <div className="view-credential-hosts">
          {localized('It will be sent only to')}
          {credential.hosts.map((h) => (
            <code key={h}>{h}</code>
          ))}
        </div>
        {mismatch && (
          <div className="view-credential-warning">
            {localized(
              'This key is labeled as a %@ key, but these hosts don’t belong to %@. Only continue if you trust this View.',
              mismatch,
              mismatch
            )}
          </div>
        )}
        {credential.help && <p className="view-credential-help">{credential.help}</p>}
        {credential.helpUrl && (
          <a
            className="view-credential-link"
            onClick={() => shell.openExternal(credential.helpUrl).catch(() => {})}
          >
            {credential.helpUrl}
          </a>
        )}
        <input
          type="password"
          autoFocus
          spellCheck={false}
          placeholder={localized('Paste your key')}
          value={this.state.secret}
          onChange={(e) => this.setState({ secret: e.target.value, error: '' })}
        />
        <p className="view-credential-fineprint">
          {localized(
            'Stored in your system keychain. This View can use it only for requests to %@, and can never read it.',
            credential.hosts.join(', ')
          )}
        </p>
        {this.state.error && <div className="view-credential-error">{this.state.error}</div>}
        <div className="view-credential-actions">
          <button type="button" className="btn" onClick={() => this.props.onDone(false)}>
            {localized('Cancel')}
          </button>
          <button type="submit" className="btn btn-emphasis" disabled={!this.state.secret.trim()}>
            {localized('Connect')}
          </button>
        </div>
      </form>
    );
  }
}

let pendingResolve: ((connected: boolean) => void) | null = null;
let closeListener: (() => void) | null = null;

function settle(connected: boolean) {
  const resolve = pendingResolve;
  pendingResolve = null;
  if (closeListener) closeListener();
  closeListener = null;
  if (resolve) resolve(connected);
}

/**
 * Opens the host's "Connect" sheet for one of a View's declared credentials. Resolves with
 * whether a key was stored. Only one sheet is open at a time; a second request while one is
 * showing resolves false.
 */
export function requestCredential(viewId: string, credentialId: string): Promise<boolean> {
  const credential = declaredCredential(viewId, credentialId);
  if (!credential) return Promise.reject(new Error(`This View doesn't declare "${credentialId}".`));
  if (pendingResolve) return Promise.resolve(false);
  return new Promise((resolve) => {
    pendingResolve = resolve;
    const done = (connected: boolean) => {
      settle(connected);
      Actions.closeModal();
    };
    Actions.openModal({
      component: <ConnectCredential viewId={viewId} credential={credential} onDone={done} />,
      width: 460,
      height: 470,
    });
    // Escape or a click outside closes the modal without saving.
    closeListener = Actions.closeModal.listen(() => settle(false));
  });
}

interface ManageProps {
  viewId: string;
}

/** Per-View list of declared credentials with their status, opened from the Views home. */
export class ManageCredentials extends React.Component<
  ManageProps,
  { status: { [id: string]: boolean } }
> {
  state = { status: {} as { [id: string]: boolean } };

  componentDidMount() {
    this._refresh();
  }

  async _refresh() {
    const status: { [id: string]: boolean } = {};
    for (const c of declaredCredentials(this.props.viewId)) {
      status[c.id] = await isConnected(this.props.viewId, c.id);
    }
    this.setState({ status });
  }

  // Reloading the View after a change made here is the simplest way to make sure it sees the
  // new state; a View that asked for the key itself learns the result from ui.requestCredential.
  _replace = async (credential: ViewCredential) => {
    const { viewId } = this.props;
    // The connect sheet replaces this modal.
    Actions.closeModal();
    setTimeout(async () => {
      if (await requestCredential(viewId, credential.id)) notifyViewsChanged([viewId]);
    }, 300);
  };

  _remove = async (credential: ViewCredential) => {
    await removeCredential(this.props.viewId, credential.id);
    notifyViewsChanged([this.props.viewId]);
    this._refresh();
  };

  render() {
    const credentials = declaredCredentials(this.props.viewId);
    return (
      <div className="view-credential-sheet">
        <h2>{localized('Credentials for “%@”', viewName(this.props.viewId))}</h2>
        {credentials.length === 0 && <p>{localized('This View doesn’t use any credentials.')}</p>}
        {credentials.map((c) => (
          <div key={c.id} className="view-credential-row">
            <div className="view-credential-row-text">
              <div className="view-credential-row-label">{c.label}</div>
              <div className="view-credential-row-hosts">{c.hosts.join(', ')}</div>
            </div>
            <div className="view-credential-row-status">
              {this.state.status[c.id] ? localized('Connected') : localized('Not set')}
            </div>
            <button className="btn" onClick={() => this._replace(c)}>
              {this.state.status[c.id] ? localized('Replace') : localized('Connect')}
            </button>
            {this.state.status[c.id] && (
              <button className="btn" onClick={() => this._remove(c)}>
                {localized('Remove')}
              </button>
            )}
          </div>
        ))}
        <div className="view-credential-actions">
          <button className="btn" onClick={() => Actions.closeModal()}>
            {localized('Done')}
          </button>
        </div>
      </div>
    );
  }
}

export function openManageCredentials(viewId: string) {
  Actions.openModal({
    component: <ManageCredentials viewId={viewId} />,
    width: 520,
    height: 360,
  });
}
