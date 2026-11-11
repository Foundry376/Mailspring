import React from 'react';
import path from 'path';
import { localized, SoundRegistry } from 'mailspring-exports';
import ConfigSchemaItem from './config-schema-item';
import { ConfigLike, ConfigSchemaLike } from '../types';
import {
  CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY,
  SUPPORTED_NOTIFICATION_SOUND_EXTENSIONS,
  isSupportedNotificationSoundPath,
  notificationSoundPlaybackOptions,
  resolveCustomNotificationSound,
} from '../../../custom-sounds/lib/notification-sound';

export default class NotificationsSection extends React.Component<{
  config: ConfigLike;
  configSchema: ConfigSchemaLike;
}> {
  _chooseSound = () => {
    AppEnv.showOpenDialog(
      {
        title: localized('Choose a notification sound'),
        buttonLabel: localized('Choose'),
        properties: ['openFile'],
        filters: [
          {
            name: localized('Audio files'),
            extensions: SUPPORTED_NOTIFICATION_SOUND_EXTENSIONS,
          },
        ],
      },
      (paths) => {
        if (!paths || paths.length === 0) return;
        if (!isSupportedNotificationSoundPath(paths[0])) {
          AppEnv.showErrorDialog(
            localized(
              'Please choose an audio file with one of these extensions: %@',
              SUPPORTED_NOTIFICATION_SOUND_EXTENSIONS.join(', ')
            )
          );
          return;
        }
        this.props.config.set(CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY, paths[0]);
      }
    );
  };

  _resetSound = () => {
    this.props.config.set(CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY, '');
  };

  _playTestSound = () => {
    SoundRegistry.playSound('new-mail', notificationSoundPlaybackOptions(this.props.config));
  };

  render() {
    const customPath = this.props.config.get(CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY);
    const customSource = resolveCustomNotificationSound(customPath);
    return (
      <div>
        <ConfigSchemaItem
          configSchema={this.props.configSchema}
          keyName={localized('Notifications')}
          keyPath="core.notifications"
          config={this.props.config}
        />
        <div className="notification-sound-controls">
          <div className="notification-sound-file">
            {customPath
              ? customSource
                ? localized('Custom sound: %@', path.basename(customPath))
                : localized('Custom sound unavailable; using the default sound')
              : localized('Using the default notification sound')}
          </div>
          <button className="btn btn-small" onClick={this._chooseSound}>
            {localized('Choose Sound…')}
          </button>
          {customPath && (
            <button className="btn btn-small" onClick={this._resetSound}>
              {localized('Reset to Default')}
            </button>
          )}
          <button className="btn btn-small" onClick={this._playTestSound}>
            {localized('Play Test Sound')}
          </button>
        </div>
      </div>
    );
  }
}
