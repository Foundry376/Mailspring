import React from 'react';
import { Actions, localized } from 'mailspring-exports';
import { openView } from '../authoring';
import { ViewsNavStore } from '../views-nav';
import { agentPublicKey } from '../agent/signing';
import { limitNotice } from '../agent/quota';
import { AgentAPIError } from '../agent/types';
import { AgentActions, AgentSessionStore } from '../agent/store';
import { ShareClient, SharedViewInfo, ShareTransport } from './client';
import { GrantSummary } from './grant-summary';
import { installSharedView, installedFromShare } from './install';

interface InstallSheetProps {
  shareId: string;
  transport?: ShareTransport;
}

interface InstallSheetState {
  info: SharedViewInfo | null;
  loadError: string | null;
  installing: boolean;
  error: string | null;
}

// Modals replace each other, so the upgrade prompt opens once this sheet has closed.
const MODAL_SWAP_MS = 300;

function showInstalled(viewId: string) {
  if (!openView(viewId)) ViewsNavStore.showHome();
}

/**
 * Shown for a `mailspring://install-view` link: what a shared View is and what it can do, from
 * the share's public metadata, before anything is downloaded or charged.
 */
export class InstallSheet extends React.Component<InstallSheetProps, InstallSheetState> {
  static displayName = 'InstallSheet';

  transport: ShareTransport = this.props.transport || new ShareClient();
  mounted = false;
  state: InstallSheetState = { info: null, loadError: null, installing: false, error: null };

  async componentDidMount() {
    this.mounted = true;
    try {
      const info = await this.transport.getShared(this.props.shareId);
      if (this.mounted) this.setState({ info });
    } catch (err) {
      if (!this.mounted) return;
      const missing = err instanceof AgentAPIError && err.code === 'not_found';
      this.setState({
        loadError: missing
          ? localized('This View is no longer shared.')
          : err.message || localized('Something went wrong.'),
      });
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  _onInstall = async () => {
    this.setState({ installing: true, error: null });
    try {
      const viewId = await installSharedView({
        shareId: this.props.shareId,
        transport: this.transport,
        publicKey: agentPublicKey(AppEnv.config.get('env')),
      });
      Actions.closeModal();
      showInstalled(viewId);
      AgentActions.refreshUsage();
    } catch (err) {
      if (!this.mounted) return;
      const notice = err instanceof AgentAPIError ? limitNotice(err.code, err.details || {}) : null;
      if (notice && notice.canUpgrade) {
        Actions.closeModal();
        setTimeout(() => AgentSessionStore.showUpgradeForNotice(notice), MODAL_SWAP_MS);
        return;
      }
      this.setState({ installing: false, error: notice ? notice.message : err.message });
    }
  };

  _renderBody(info: SharedViewInfo) {
    const existing = installedFromShare(info.shareId)[0];
    const { installing, error } = this.state;
    return (
      <div className="view-share-sheet">
        {info.posterURL && (
          <div className="view-share-poster">
            <img alt="" src={info.posterURL} />
          </div>
        )}
        <h2>{info.name}</h2>
        {info.description && <p className="view-share-description">{info.description}</p>}
        <div className="view-share-section-title">{localized('What it can do')}</div>
        <GrantSummary manifest={{ permissions: info.permissions, network: info.network }} />
        <p className="view-share-fineprint">
          {localized(
            'Someone shared this View. It runs on your computer, and asks you to allow this before it sees your mail. Installing it counts as one of your Views, like building one.'
          )}
        </p>
        {existing && (
          <div className="view-share-notice">
            {localized('You’ve already installed this View.')}
          </div>
        )}
        {error && <div className="view-share-error">{error}</div>}
        <div className="view-share-actions">
          <button type="button" className="btn" onClick={() => Actions.closeModal()}>
            {localized('Cancel')}
          </button>
          {existing && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                Actions.closeModal();
                showInstalled(existing.id);
              }}
            >
              {localized('Open It')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-emphasis"
            disabled={installing}
            onClick={this._onInstall}
          >
            {installing
              ? localized('Installing…')
              : existing
                ? localized('Install Another Copy')
                : localized('Install')}
          </button>
        </div>
      </div>
    );
  }

  render() {
    const { info, loadError } = this.state;
    if (info) return this._renderBody(info);
    return (
      <div className="view-share-sheet loading">
        {loadError ? (
          <>
            <div className="view-share-error">{loadError}</div>
            <div className="view-share-actions">
              <button type="button" className="btn" onClick={() => Actions.closeModal()}>
                {localized('Close')}
              </button>
            </div>
          </>
        ) : (
          localized('Loading…')
        )}
      </div>
    );
  }
}

export function openInstallSheet(shareId: string) {
  Actions.openModal({
    component: <InstallSheet shareId={shareId} />,
    width: 520,
  });
}
