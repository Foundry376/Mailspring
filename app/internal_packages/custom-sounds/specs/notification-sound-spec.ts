import path from 'path';
import { pathToFileURL } from 'url';
import {
  CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY,
  NOTIFICATION_SOUND_VOLUME_CONFIG_KEY,
  isSupportedNotificationSoundPath,
  notificationSoundPlaybackOptions,
  resolveCustomNotificationSound,
} from '../lib/notification-sound';

describe('notification sound settings', () => {
  it('recognizes supported extensions case-insensitively', () => {
    expect(isSupportedNotificationSoundPath('/sounds/mail.ogg')).toBe(true);
    expect(isSupportedNotificationSoundPath('/sounds/mail.MP3')).toBe(true);
    expect(isSupportedNotificationSoundPath('/sounds/mail.txt')).toBe(false);
    expect(isSupportedNotificationSoundPath('')).toBe(false);
  });

  it('resolves an existing supported file to a file URL', () => {
    const filePath = path.resolve('/sounds/mail tone.ogg');
    expect(resolveCustomNotificationSound(filePath, () => true)).toBe(
      pathToFileURL(filePath).toString()
    );
  });

  it('falls back for missing and unsupported files', () => {
    expect(resolveCustomNotificationSound('/sounds/missing.ogg', () => false)).toBeUndefined();
    expect(resolveCustomNotificationSound('/sounds/mail.txt', () => true)).toBeUndefined();
    expect(resolveCustomNotificationSound(undefined, () => true)).toBeUndefined();
  });

  it('builds playback options from independent volume and custom-path preferences', () => {
    const customPath = path.resolve('/sounds/mail.ogg');
    const config = {
      get: (key) => {
        if (key === NOTIFICATION_SOUND_VOLUME_CONFIG_KEY) return 25;
        if (key === CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY) return customPath;
        return undefined;
      },
    };

    expect(notificationSoundPlaybackOptions(config, () => true)).toEqual({
      volume: 0.25,
      source: pathToFileURL(customPath).toString(),
    });
    expect(notificationSoundPlaybackOptions(config, () => false)).toEqual({ volume: 0.25 });
  });
});
