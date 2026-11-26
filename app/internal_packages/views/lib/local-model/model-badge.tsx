import React from 'react';
import classnames from 'classnames';
import { AIStore, LocalModelStatus, LocalModelStore, localized } from 'mailspring-exports';
import { AIEnabledSwitch, EnableAIPrompt, LocalModelSettings } from 'mailspring-component-kit';

/**
 * The pill's prefix. The badge is about running Views, not building them (that uses cloud AI),
 * so it names what Views run on rather than saying "AI" alone.
 */
export function badgePrefix(status: LocalModelStatus | null) {
  return status && status.state.kind === 'disabled'
    ? localized('AI in Views')
    : localized('Views run on');
}

/** The pill's short state, after the prefix. */
export function badgeLabel(status: LocalModelStatus | null) {
  if (!status) return localized('Checking…');
  const { state } = status;
  switch (state.kind) {
    case 'system':
      return state.label;
    case 'checking':
      return localized('Checking…');
    case 'system-preparing':
      return localized('%@ is getting ready', state.label);
    case 'system-disabled':
      return localized('Not set up');
    case 'ready':
      return localized('%@ (local)', state.label);
    case 'downloading':
      return localized(
        'downloading %@%',
        Math.floor((state.receivedBytes / (state.totalBytes || 1)) * 100)
      );
    case 'error':
      return localized('Download paused');
    case 'insufficient-disk':
      return localized('Not enough disk space');
    case 'not-downloaded':
      return localized('Not downloaded');
    case 'disabled':
      return localized('Off');
  }
}

interface ModelBadgeState {
  status: LocalModelStatus | null;
  open: boolean;
  /** AI was off when the popover opened; it keeps showing the prompt's progress until closed. */
  enabling: boolean;
}

/**
 * The Views home's AI badge: whether AI is on, which model Views use, and the download's
 * progress, with the same AI switch as Preferences > AI. Opening the Views home never starts a
 * download; only turning AI on does.
 */
export class ModelBadge extends React.Component<Record<string, never>, ModelBadgeState> {
  static displayName = 'ModelBadge';

  _unlisten: () => void;
  _unlistenAI: () => void;
  _root = React.createRef<HTMLDivElement>();

  state: ModelBadgeState = { status: LocalModelStore.status(), open: false, enabling: false };

  componentDidMount() {
    this._unlisten = LocalModelStore.listen(() =>
      this.setState({ status: LocalModelStore.status() })
    );
    this._unlistenAI = AIStore.listen(() => this.forceUpdate());
    document.addEventListener('mousedown', this._onDocumentMouseDown);
  }

  componentWillUnmount() {
    this._unlisten();
    this._unlistenAI();
    document.removeEventListener('mousedown', this._onDocumentMouseDown);
  }

  _onDocumentMouseDown = (e: MouseEvent) => {
    if (this.state.open && this._root.current && !this._root.current.contains(e.target as Node)) {
      this.setState({ open: false });
    }
  };

  _renderPopover(status: LocalModelStatus) {
    const enabled = status.state.kind !== 'disabled';
    if (!AIStore.isEnabled() || this.state.enabling) {
      return (
        <div className="model-badge-popover" role="dialog">
          <EnableAIPrompt
            reason={localized(
              'Some Views summarize mail or pull out details like prices and tracking numbers.'
            )}
            onNotNow={() => this.setState({ open: false })}
            onDone={() => this.setState({ open: false, enabling: false })}
          />
        </div>
      );
    }
    if (AIStore.backend().remote) {
      return (
        <div className="model-badge-popover" role="dialog">
          <div className="model-badge-title">{localized('AI inside your Views')}</div>
          <div className="model-badge-model">
            {localized('OpenRouter (remote) · %@', AIStore.openRouterModel())}
          </div>
          <p className="local-model-intro">
            {localized(
              'Views you allow send the text of the messages they ask about to OpenRouter. Each View asks first.'
            )}
          </p>
          <button className="local-model-link" onClick={() => AIStore.openSettings()}>
            {localized('AI Settings…')}
          </button>
          <div className="model-badge-switch">
            <AIEnabledSwitch id="model-badge-ai-enabled" />
          </div>
        </div>
      );
    }
    return (
      <div className="model-badge-popover" role="dialog">
        <div className="model-badge-title">{localized('AI inside your Views')}</div>
        <div className="model-badge-model">
          {enabled ? status.state.label : localized('Turned off')}
        </div>
        <LocalModelSettings
          status={status}
          intro={
            <p className="local-model-intro">
              {localized(
                "Some Views summarize mail or pull out details like prices and tracking numbers. They use a model on this computer — your mail isn't sent anywhere."
              )}
            </p>
          }
        />
        <div className="model-badge-switch">
          <AIEnabledSwitch id="model-badge-ai-enabled" />
        </div>
      </div>
    );
  }

  render() {
    const { status, open } = this.state;
    const remote = AIStore.isEnabled() && AIStore.backend().remote;
    const kind = remote ? 'remote' : status ? status.state.kind : 'checking';
    return (
      <div className="model-badge" ref={this._root}>
        <button
          className={classnames('model-badge-pill', kind, { open })}
          onClick={() => this.setState({ open: !open, enabling: !open && !AIStore.isEnabled() })}
          title={localized('The AI that Views use')}
        >
          <span className="model-badge-dot" />
          <span className="model-badge-name">{badgePrefix(status)}</span>
          <span className="model-badge-sep">·</span>
          <span className="model-badge-state">
            {remote ? localized('OpenRouter (remote)') : badgeLabel(status)}
          </span>
        </button>
        {open && status && this._renderPopover(status)}
      </div>
    );
  }
}
