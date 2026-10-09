import React from 'react';
import classnames from 'classnames';
import { shell } from 'electron';
import { localized } from 'mailspring-exports';
import { LocalModelStatus, LocalModelStore, formatBytes } from './store';

const APPLE_INTELLIGENCE_SETTINGS = 'x-apple.systempreferences:com.apple.Siri-Settings.extension';
// The downloadable model's name, for states labelled with the system model's name.
const DOWNLOADABLE_MODEL = 'Qwen 3.5';

function confirm(message: string, detail: string, action: string) {
  const choice = require('@electron/remote').dialog.showMessageBoxSync({
    type: 'question',
    buttons: [action, localized('Cancel')],
    defaultId: 0,
    cancelId: 1,
    message,
    detail,
  });
  return choice === 0;
}

/** The pill's short state, after "On-device AI ·". */
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
      return state.label;
    case 'downloading':
      return localized(
        'Downloading %@%',
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
    LocalModelStore.viewsOpened();
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

  _onToggleEnabled = async () => {
    const { status } = this.state;
    if (!status) return;
    if (status.state.kind !== 'disabled') {
      const freed = status.bytesOnDisk;
      const ok = confirm(
        localized('Turn off on-device AI for Views?'),
        freed
          ? localized(
              'This stops any download and deletes the model, freeing %@. Views still work; AI summaries and smart extraction are turned off.',
              formatBytes(freed)
            )
          : localized(
              'Views still work; AI summaries and smart extraction are turned off. Nothing will be downloaded.'
            ),
        localized('Turn Off')
      );
      if (ok) await LocalModelStore.setEnabled(false);
    } else {
      await LocalModelStore.setEnabled(true);
    }
  };

  _onUseSystemModel = async () => {
    const { status } = this.state;
    await LocalModelStore.setProvider('auto');
    if (status && status.bytesOnDisk > 0) {
      const ok = confirm(
        localized('Delete the downloaded model?'),
        localized(
          'Views will use %@. Deleting %@ frees %@; you can download it again later.',
          status.system.name,
          status.state.label,
          formatBytes(status.bytesOnDisk)
        ),
        localized('Delete')
      );
      if (ok) await LocalModelStore.deleteDownloaded();
    }
  };

  _renderProgress(received: number, total: number) {
    const pct = Math.min(100, (received / (total || 1)) * 100);
    return (
      <div className="model-badge-progress">
        <div className="model-badge-progress-bar">
          <div className="model-badge-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="model-badge-progress-text">
          {localized('%@ of %@', formatBytes(received), formatBytes(total))}
        </div>
      </div>
    );
  }

  _renderBody(status: LocalModelStatus): React.ReactNode {
    const { state } = status;
    const local = (
      <p className="model-badge-local">
        {localized('Runs on your computer. Your mail is never sent anywhere to be summarized.')}
      </p>
    );
    switch (state.kind) {
      case 'system':
        return (
          <p className="model-badge-local">
            {localized(
              'Provided by macOS (%@). Runs on your Mac, with nothing extra to download.',
              state.label
            )}
          </p>
        );
      case 'checking':
        return local;
      case 'system-preparing':
        return (
          <p className="model-badge-local">
            {localized(
              '%@ is getting ready. Views will use it as soon as macOS finishes setting it up — nothing extra to download.',
              state.label
            )}
          </p>
        );
      case 'system-disabled':
        return (
          <>
            <p className="model-badge-local">
              {localized(
                'Turn on %@ in System Settings to use the model built into macOS, or download %@ (%@) instead. Either way it runs on your Mac.',
                state.label,
                DOWNLOADABLE_MODEL,
                formatBytes(state.totalBytes)
              )}
            </p>
            <div className="model-badge-actions">
              <button
                className="btn btn-small"
                onClick={() => shell.openExternal(APPLE_INTELLIGENCE_SETTINGS)}
              >
                {localized('Open System Settings')}
              </button>
              <button className="btn btn-small" onClick={() => LocalModelStore.start(false)}>
                {localized('Download Instead')}
              </button>
            </div>
          </>
        );
      case 'ready':
        return (
          <>
            {local}
            <div className="model-badge-detail">
              {state.source === 'dev'
                ? localized('Development copy · %@', formatBytes(state.sizeBytes))
                : localized('%@ on disk', formatBytes(state.sizeBytes))}
            </div>
          </>
        );
      case 'downloading':
        return (
          <>
            {local}
            {this._renderProgress(state.receivedBytes, state.totalBytes)}
            <div className="model-badge-actions">
              <button className="btn btn-small" onClick={() => LocalModelStore.cancel()}>
                {localized('Cancel Download')}
              </button>
            </div>
          </>
        );
      case 'error':
        return (
          <>
            {local}
            <div className="model-badge-error">{state.message}</div>
            <div className="model-badge-actions">
              <button className="btn btn-small" onClick={() => LocalModelStore.start(false)}>
                {localized('Resume Download')}
              </button>
            </div>
          </>
        );
      case 'insufficient-disk':
        return (
          <>
            {local}
            <div className="model-badge-error">
              {localized(
                'Only %@ is free on this disk, so the %@ model wasn’t downloaded automatically. Views work without it.',
                formatBytes(state.freeBytes),
                formatBytes(state.totalBytes)
              )}
            </div>
            <div className="model-badge-actions">
              <button className="btn btn-small" onClick={() => LocalModelStore.start(true)}>
                {localized('Download Anyway')}
              </button>
            </div>
          </>
        );
      case 'not-downloaded':
        return (
          <>
            {local}
            <div className="model-badge-actions">
              <button className="btn btn-small" onClick={() => LocalModelStore.start(false)}>
                {localized('Download (%@)', formatBytes(state.totalBytes))}
              </button>
            </div>
          </>
        );
      case 'disabled':
        return (
          <p className="model-badge-local">
            {localized(
              'Views still work; AI summaries and smart extraction are turned off. Nothing is downloaded.'
            )}
          </p>
        );
    }
  }

  _renderProviderChoice(status: LocalModelStatus) {
    if (!status.system.available || status.state.kind === 'disabled') return null;
    if (status.provider === 'qwen') {
      return (
        <button className="model-badge-link" onClick={this._onUseSystemModel}>
          {localized('Use %@ instead', status.system.name)}
        </button>
      );
    }
    return (
      <button className="model-badge-link" onClick={() => LocalModelStore.setProvider('qwen')}>
        {localized('Use the downloadable model (%@) instead', DOWNLOADABLE_MODEL)}
      </button>
    );
  }

  _renderPopover(status: LocalModelStatus) {
    const enabled = status.state.kind !== 'disabled';
    const title = enabled ? status.state.label : localized('On-device AI is off');
    return (
      <div className="model-badge-popover" role="dialog">
        <div className="model-badge-title">{title}</div>
        {this._renderBody(status)}
        {this._renderProviderChoice(status)}
        <label className="model-badge-switch">
          <input type="checkbox" checked={enabled} onChange={this._onToggleEnabled} />
          <span>{localized('Download AI models for Views')}</span>
        </label>
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
          title={localized('On-device AI used by Views')}
        >
          <span className="model-badge-dot" />
          <span className="model-badge-name">{localized('On-device AI')}</span>
          <span className="model-badge-sep">·</span>
          <span className="model-badge-state">{badgeLabel(status)}</span>
        </button>
        {open && status && this._renderPopover(status)}
      </div>
    );
  }
}
