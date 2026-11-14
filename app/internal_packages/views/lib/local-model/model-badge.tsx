import React from 'react';
import classnames from 'classnames';
import { LocalModelStatus, LocalModelStore, localized } from 'mailspring-exports';
import { LocalModelSettings } from 'mailspring-component-kit';

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
}

/**
 * The Views home's on-device AI badge: which model Views use, that it runs locally, the first
 * download's progress, and the switch to turn model downloads off.
 */
export class ModelBadge extends React.Component<Record<string, never>, ModelBadgeState> {
  static displayName = 'ModelBadge';

  _unlisten: () => void;
  _root = React.createRef<HTMLDivElement>();

  state: ModelBadgeState = { status: LocalModelStore.status(), open: false };

  componentDidMount() {
    this._unlisten = LocalModelStore.listen(() =>
      this.setState({ status: LocalModelStore.status() })
    );
    LocalModelStore.prepare();
    document.addEventListener('mousedown', this._onDocumentMouseDown);
  }

  componentWillUnmount() {
    this._unlisten();
    document.removeEventListener('mousedown', this._onDocumentMouseDown);
  }

  _onDocumentMouseDown = (e: MouseEvent) => {
    if (this.state.open && this._root.current && !this._root.current.contains(e.target as Node)) {
      this.setState({ open: false });
    }
  };

  _renderPopover(status: LocalModelStatus) {
    const enabled = status.state.kind !== 'disabled';
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
      </div>
    );
  }

  render() {
    const { status, open } = this.state;
    const kind = status ? status.state.kind : 'checking';
    return (
      <div className="model-badge" ref={this._root}>
        <button
          className={classnames('model-badge-pill', kind, { open })}
          onClick={() => this.setState({ open: !open })}
          title={localized('The AI that Views use on this computer')}
        >
          <span className="model-badge-dot" />
          <span className="model-badge-name">{badgePrefix(status)}</span>
          <span className="model-badge-sep">·</span>
          <span className="model-badge-state">{badgeLabel(status)}</span>
        </button>
        {open && status && this._renderPopover(status)}
      </div>
    );
  }
}
