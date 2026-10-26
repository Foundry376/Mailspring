import React from 'react';
import { shell } from 'electron';
import { Actions, localized } from 'mailspring-exports';
import { CopyButton, SVGIcons } from 'mailspring-component-kit';
import { allViews } from '../view-registry';
import { acceptedAgentRevision } from '../agent/store';
import { openPanelWithMessage } from '../authoring-panel';
import { ShareClient, ShareRecord, ShareTransport } from './client';
import { renderSharePosters } from './posters';
import {
  MAX_DESCRIPTION_CHARS,
  MAX_NAME_CHARS,
  hasMockData,
  mockDataRequest,
  noMockDataMessage,
  publishView,
  shareErrorMessage,
  shareTextProblem,
  shareableRevision,
} from './publish';

type Phase = 'loading' | 'edit' | 'publishing' | 'shared' | 'no-mock-data';

interface Share {
  shareId: string;
  url: string;
  revision: number;
}

interface Posters {
  status: 'idle' | 'rendering' | 'ready' | 'failed';
  og?: string;
  card?: string;
  error?: string;
}

interface ShareSheetProps {
  viewId: string;
  transport?: ShareTransport;
}

interface ShareSheetState {
  phase: Phase;
  name: string;
  description: string;
  posters: Posters;
  share: Share | null;
  error: string | null;
  notice: string | null;
  busy: boolean;
}

function viewOf(viewId: string) {
  return allViews().find((v) => v.id === viewId) || null;
}

/** The share the sheet opens on: the one for the current revision, else the newest. */
export function currentShare(shares: ShareRecord[], viewId: string, revision: number) {
  const mine = shares
    .filter((s) => s.viewId === viewId)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return mine.find((s) => s.revision === revision) || mine[0] || null;
}

/**
 * Publishes a View the agent built to a public page, or shows the link it already has. The
 * user sees and edits everything that becomes public (name, description, poster) before it's
 * sent.
 */
export class ShareSheet extends React.Component<ShareSheetProps, ShareSheetState> {
  static displayName = 'ShareSheet';

  transport: ShareTransport = this.props.transport || new ShareClient();
  revision = shareableRevision(viewOf(this.props.viewId), acceptedAgentRevision(this.props.viewId));
  mounted = false;

  constructor(props: ShareSheetProps) {
    super(props);
    const view = viewOf(props.viewId);
    this.state = {
      phase: 'loading',
      name: view ? view.name.slice(0, MAX_NAME_CHARS) : '',
      description: ((view && view.json.description) || '').slice(0, MAX_DESCRIPTION_CHARS),
      posters: { status: 'idle' },
      share: null,
      error: null,
      notice: null,
      busy: false,
    };
  }

  async componentDidMount() {
    this.mounted = true;
    if (!hasMockData(this.props.viewId)) {
      this.setState({ phase: 'no-mock-data' });
      return;
    }
    let error: string | null = null;
    try {
      const shares = await this.transport.listShares(this.props.viewId);
      const share = currentShare(shares, this.props.viewId, this.revision);
      if (share && this.mounted) {
        this.setState({ phase: 'shared', share, name: share.name || this.state.name });
        return;
      }
    } catch (err) {
      error = shareErrorMessage(err);
    }
    if (this.mounted) this._edit({ error });
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  _edit(extra: Partial<ShareSheetState> = {}) {
    this.setState({ phase: 'edit', ...extra } as ShareSheetState);
    if (this.state.posters.status === 'idle' || this.state.posters.status === 'failed') {
      this._renderPosters();
    }
  }

  async _renderPosters() {
    const view = viewOf(this.props.viewId);
    if (!view) return;
    this.setState({ posters: { status: 'rendering' } });
    try {
      const posters = await renderSharePosters(view.id, view.placement);
      if (this.mounted) this.setState({ posters: { status: 'ready', ...posters } });
    } catch (err) {
      if (this.mounted) this.setState({ posters: { status: 'failed', error: err.message } });
    }
  }

  _onPublish = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const { name, description, posters } = this.state;
    if (shareTextProblem(name, description) || posters.status !== 'ready') return;
    this.setState({ phase: 'publishing', error: null, notice: null });
    try {
      const published = await publishView({
        viewId: this.props.viewId,
        revision: this.revision,
        name,
        description,
        posters: { og: posters.og, card: posters.card },
        transport: this.transport,
      });
      if (!this.mounted) return;
      this.setState({
        phase: 'shared',
        share: { shareId: published.shareId, url: published.url, revision: this.revision },
      });
    } catch (err) {
      if (!this.mounted) return;
      this.setState({ phase: 'edit', error: shareErrorMessage(err) });
    }
  };

  _onAskAgent = (message: string) => {
    Actions.closeModal();
    openPanelWithMessage(this.props.viewId, message).catch((err) =>
      AppEnv.showErrorDialog({ title: localized('Views'), message: err.message })
    );
  };

  _onOpenPage = () => {
    shell.openExternal(this.state.share.url).catch(() => {});
  };

  _onStopSharing = async () => {
    const chosen = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'warning',
      buttons: [localized('Stop Sharing'), localized('Cancel')],
      defaultId: 1,
      cancelId: 1,
      message: localized('Stop sharing “%@”?', this.state.name),
      detail: localized(
        'The link stops working. Anyone who already added the View keeps their copy.'
      ),
    });
    if (chosen !== 0) return;
    this.setState({ busy: true, error: null });
    try {
      await this.transport.remove(this.state.share.shareId);
      if (!this.mounted) return;
      this._edit({
        share: null,
        busy: false,
        notice: localized('Stopped sharing. The link no longer works.'),
      });
    } catch (err) {
      if (this.mounted) this.setState({ busy: false, error: shareErrorMessage(err) });
    }
  };

  _renderPoster() {
    const { posters } = this.state;
    if (posters.status === 'ready') {
      return (
        <div className="view-share-poster">
          <img alt="" src={`data:image/png;base64,${posters.card}`} />
        </div>
      );
    }
    if (posters.status === 'failed') {
      return (
        <div className="view-share-poster empty">
          <div className="view-share-error">
            {localized(
              'The preview couldn’t be made from the View’s sample data: %@',
              posters.error
            )}
          </div>
          <button type="button" className="btn btn-small" onClick={() => this._renderPosters()}>
            {localized('Try Again')}
          </button>
        </div>
      );
    }
    return (
      <div className="view-share-poster empty">
        {localized('Making a preview from the View’s sample data…')}
      </div>
    );
  }

  _renderActions(children: React.ReactNode) {
    return <div className="view-share-actions">{children}</div>;
  }

  _renderEdit() {
    const { name, description, posters, phase, error, notice } = this.state;
    const view = viewOf(this.props.viewId);
    const problem = shareTextProblem(name, description);
    const publishing = phase === 'publishing';
    const { share } = this.state;
    const updating = !!share && share.revision === this.revision;
    return (
      <form className="view-share-sheet" onSubmit={this._onPublish}>
        <h2>{localized('Share “%@”', view ? view.name : this.props.viewId)}</h2>
        <p className="view-share-intro">
          {localized(
            'Anyone with the link can preview and install this View. The View will run on their email, not yours. Example emails you provided the agent are not shared.'
          )}
        </p>
        {notice && <div className="view-share-notice">{notice}</div>}
        {this._renderPoster()}
        <label>
          {localized('Name')}
          <input
            type="text"
            maxLength={MAX_NAME_CHARS}
            value={name}
            disabled={publishing}
            onChange={(e) => this.setState({ name: e.target.value })}
          />
        </label>
        <label>
          {localized('Description')}
          <textarea
            rows={3}
            maxLength={MAX_DESCRIPTION_CHARS}
            value={description}
            disabled={publishing}
            placeholder={localized('What it shows, and who might find it useful.')}
            onChange={(e) => this.setState({ description: e.target.value })}
          />
        </label>
        <p className="view-share-fineprint">
          {localized('Later changes aren’t shared unless you share again.')}
        </p>
        {error && <div className="view-share-error">{error}</div>}
        {name.trim() && problem && <div className="view-share-error">{problem}</div>}
        {this._renderActions(
          <>
            <button type="button" className="btn" onClick={() => Actions.closeModal()}>
              {localized('Cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-emphasis"
              disabled={!!problem || posters.status !== 'ready' || publishing}
            >
              {publishing
                ? localized('Publishing…')
                : updating
                  ? localized('Update')
                  : localized('Publish')}
            </button>
          </>
        )}
      </form>
    );
  }

  _renderShared() {
    const { share, busy, error, posters } = this.state;
    const outdated = share.revision > 0 && share.revision !== this.revision;
    return (
      <div className="view-share-sheet">
        <h2>{localized('“%@” is shared', this.state.name)}</h2>
        {posters.status === 'ready' && this._renderPoster()}
        <div className="view-share-link">
          <input type="text" readOnly value={share.url} onFocus={(e) => e.target.select()} />
          <CopyButton text={share.url} title={localized('Copy Link')} />
          <button
            type="button"
            className="btn btn-small btn-icon view-share-open"
            title={localized('Open Page')}
            aria-label={localized('Open Page')}
            onClick={this._onOpenPage}
          >
            <SVGIcons.OpenPage />
          </button>
        </div>
        <p className="view-share-fineprint">
          {outdated
            ? localized(
                'You’ve changed this View since you shared it. The link still shows the earlier version.'
              )
            : localized(
                'People who add it get this version. Later changes aren’t shared unless you share again.'
              )}
        </p>
        {error && <div className="view-share-error">{error}</div>}
        {this._renderActions(
          <>
            <button type="button" className="btn" disabled={busy} onClick={this._onStopSharing}>
              {localized('Stop Sharing')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => this._edit()}>
              {outdated ? localized('Share This Version') : localized('Update')}
            </button>
            <button type="button" className="btn btn-emphasis" onClick={() => Actions.closeModal()}>
              {localized('Done')}
            </button>
          </>
        )}
      </div>
    );
  }

  _renderNoMockData() {
    return (
      <div className="view-share-sheet">
        <h2>{localized('This View needs sample data first')}</h2>
        <p className="view-share-intro">{noMockDataMessage()}</p>
        {this._renderActions(
          <>
            <button type="button" className="btn" onClick={() => Actions.closeModal()}>
              {localized('Cancel')}
            </button>
            <button
              type="button"
              className="btn btn-emphasis"
              onClick={() => this._onAskAgent(mockDataRequest())}
            >
              {localized('Ask the Agent')}
            </button>
          </>
        )}
      </div>
    );
  }

  render() {
    switch (this.state.phase) {
      case 'loading':
        return <div className="view-share-sheet loading">{localized('Loading…')}</div>;
      case 'no-mock-data':
        return this._renderNoMockData();
      case 'shared':
        return this._renderShared();
      default:
        return this._renderEdit();
    }
  }
}

export function openShareSheet(viewId: string) {
  Actions.openModal({
    component: <ShareSheet viewId={viewId} />,
    width: 520,
  });
}
