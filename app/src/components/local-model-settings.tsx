import React from 'react';
import { shell } from 'electron';
import { localized } from '../intl';
import LocalModelStore, { LocalModelStatus } from '../flux/stores/local-model-store';

const APPLE_INTELLIGENCE_SETTINGS = 'x-apple.systempreferences:com.apple.Siri-Settings.extension';

export function formatModelBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

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

async function onToggleEnabled(status: LocalModelStatus) {
  if (status.state.kind === 'disabled') {
    await LocalModelStore.setEnabled(true);
    return;
  }
  const freed = status.bytesOnDisk;
  const ok = confirm(
    localized('Turn off on-device AI?'),
    freed
      ? localized(
          'This stops any download and deletes the model, freeing %@. Views and Mailspring keep working without AI summaries and smart extraction.',
          formatModelBytes(freed)
        )
      : localized(
          'Views and Mailspring keep working without AI summaries and smart extraction. Nothing will be downloaded.'
        ),
    localized('Turn Off')
  );
  if (ok) await LocalModelStore.setEnabled(false);
}

async function onUseSystemModel(status: LocalModelStatus) {
  await LocalModelStore.setProvider('auto');
  if (status.bytesOnDisk === 0) return;
  const ok = confirm(
    localized('Delete the downloaded model?'),
    localized(
      'Mailspring will use %@. Deleting %@ frees %@; you can download it again later.',
      status.system.name,
      status.downloadable.label,
      formatModelBytes(status.bytesOnDisk)
    ),
    localized('Delete')
  );
  if (ok) await LocalModelStore.deleteDownloaded();
}

const Progress = ({ received, total }: { received: number; total: number }) => (
  <div className="local-model-progress">
    <div className="local-model-progress-bar">
      <div
        className="local-model-progress-fill"
        style={{ width: `${Math.min(100, (received / (total || 1)) * 100)}%` }}
      />
    </div>
    <div className="local-model-progress-text">
      {localized('%@ of %@', formatModelBytes(received), formatModelBytes(total))}
    </div>
  </div>
);

function StateDetails({ status, intro }: { status: LocalModelStatus; intro: React.ReactNode }) {
  const { state } = status;
  switch (state.kind) {
    case 'system':
      return (
        <>
          {intro}
          <div className="local-model-detail">
            {localized('Provided by macOS (%@)', state.label)}
          </div>
        </>
      );
    case 'checking':
      return <>{intro}</>;
    case 'system-preparing':
      return (
        <p className="local-model-intro">
          {localized(
            '%@ is getting ready. Mailspring will use it as soon as macOS finishes setting it up — nothing extra to download.',
            state.label
          )}
        </p>
      );
    case 'system-disabled':
      return (
        <>
          <p className="local-model-intro">
            {localized(
              'Turn on %@ in System Settings to use the model built into macOS, or download %@ instead. Either way it runs on your Mac.',
              state.label,
              status.downloadable.label
            )}
          </p>
          <div className="local-model-actions">
            <button
              className="btn btn-small"
              onClick={() => shell.openExternal(APPLE_INTELLIGENCE_SETTINGS)}
            >
              {localized('Open System Settings')}
            </button>
            <button className="btn btn-small" onClick={() => LocalModelStore.startDownload(false)}>
              {localized('Download Instead (%@)', formatModelBytes(state.totalBytes))}
            </button>
          </div>
        </>
      );
    case 'ready':
      return (
        <>
          {intro}
          <div className="local-model-detail">
            {state.source === 'dev'
              ? localized('Development copy · %@', formatModelBytes(state.sizeBytes))
              : localized('%@ on disk', formatModelBytes(state.sizeBytes))}
          </div>
        </>
      );
    case 'downloading':
      return (
        <>
          {intro}
          <Progress received={state.receivedBytes} total={state.totalBytes} />
          <div className="local-model-actions">
            <button className="btn btn-small" onClick={() => LocalModelStore.cancelDownload()}>
              {localized('Cancel Download')}
            </button>
          </div>
        </>
      );
    case 'error':
      return (
        <>
          {intro}
          <div className="local-model-error">{state.message}</div>
          <div className="local-model-actions">
            <button className="btn btn-small" onClick={() => LocalModelStore.startDownload(false)}>
              {localized('Resume Download')}
            </button>
          </div>
        </>
      );
    case 'insufficient-disk':
      return (
        <>
          {intro}
          <div className="local-model-error">
            {localized(
              'Only %@ is free on this disk, so the %@ model wasn’t downloaded automatically. Mailspring works without it.',
              formatModelBytes(state.freeBytes),
              formatModelBytes(state.totalBytes)
            )}
          </div>
          <div className="local-model-actions">
            <button className="btn btn-small" onClick={() => LocalModelStore.startDownload(true)}>
              {localized('Download Anyway')}
            </button>
          </div>
        </>
      );
    case 'not-downloaded':
      return (
        <>
          {intro}
          <div className="local-model-actions">
            <button className="btn btn-small" onClick={() => LocalModelStore.startDownload(false)}>
              {localized('Download (%@)', formatModelBytes(state.totalBytes))}
            </button>
          </div>
        </>
      );
    case 'disabled':
      return (
        <p className="local-model-intro">
          {localized(
            'On-device AI is off. Views and Mailspring work without AI summaries and smart extraction, and nothing is downloaded.'
          )}
        </p>
      );
  }
}

function ProviderChoice({ status }: { status: LocalModelStatus }) {
  if (!status.system.available || status.state.kind === 'disabled') return null;
  if (status.provider === 'qwen') {
    return (
      <button className="local-model-link" onClick={() => onUseSystemModel(status)}>
        {localized('Use %@ instead', status.system.name)}
      </button>
    );
  }
  return (
    <button className="local-model-link" onClick={() => LocalModelStore.setProvider('qwen')}>
      {localized('Use %@ instead', status.downloadable.label)}
    </button>
  );
}

/**
 * Controls for the on-device model: its state, the first download, the choice between Apple's
 * system model and the downloadable one, and the switch that turns on-device AI off. Shown in
 * Preferences > AI and in the Views home's model badge. `intro` explains what the model is
 * used for in that place.
 */
export function LocalModelSettings({
  status,
  intro,
}: {
  status: LocalModelStatus;
  intro: React.ReactNode;
}) {
  return (
    <div className="local-model-settings">
      <StateDetails status={status} intro={intro} />
      <ProviderChoice status={status} />
      <label className="local-model-switch">
        <input
          type="checkbox"
          checked={status.state.kind !== 'disabled'}
          onChange={() => onToggleEnabled(status)}
        />
        <span>{localized('Use on-device AI')}</span>
      </label>
    </div>
  );
}
