import path from 'path';
import { pathToFileURL } from 'url';
import {
  CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY,
  MAX_CUSTOM_NOTIFICATION_SOUND_BYTES,
  NOTIFICATION_SOUND_VOLUME_CONFIG_KEY,
  isSupportedNotificationSoundPath,
  notificationSoundPlaybackOptions,
  resolveCustomNotificationSound,
} from '../lib/notification-sound';

describe('notification sound settings', () => {
  const regularFile =
    (size = 1024) =>
    () => ({ size, isFile: () => true });

  it('recognizes supported extensions case-insensitively', () => {
    expect(isSupportedNotificationSoundPath('/sounds/mail.ogg')).toBe(true);
    expect(isSupportedNotificationSoundPath('/sounds/mail.MP3')).toBe(true);
    expect(isSupportedNotificationSoundPath('/sounds/mail.txt')).toBe(false);
    expect(isSupportedNotificationSoundPath('')).toBe(false);
  });

  it('resolves an existing supported file to a file URL', () => {
    const filePath = path.resolve('/sounds/mail tone.ogg');
    expect(resolveCustomNotificationSound(filePath, regularFile())).toBe(
      pathToFileURL(filePath).toString()
    );
  });

  it('falls back for missing, unsupported, and relative files', () => {
    const missingFile = () => {
      throw new Error('ENOENT');
    };
    expect(
      resolveCustomNotificationSound(path.resolve('/sounds/missing.ogg'), missingFile)
    ).toBeUndefined();
    expect(
      resolveCustomNotificationSound(path.resolve('/sounds/mail.txt'), regularFile())
    ).toBeUndefined();
    expect(resolveCustomNotificationSound('sounds/mail.ogg', regularFile())).toBeUndefined();
    expect(resolveCustomNotificationSound(undefined, regularFile())).toBeUndefined();
  });

  it('falls back for non-regular, empty, and oversized files', () => {
    const directory = () => ({ size: 1024, isFile: () => false });
    const filePath = path.resolve('/sounds/mail.ogg');

    expect(resolveCustomNotificationSound(filePath, directory)).toBeUndefined();
    expect(resolveCustomNotificationSound(filePath, regularFile(0))).toBeUndefined();
    expect(
      resolveCustomNotificationSound(filePath, regularFile(MAX_CUSTOM_NOTIFICATION_SOUND_BYTES + 1))
    ).toBeUndefined();
    expect(
      resolveCustomNotificationSound(filePath, regularFile(MAX_CUSTOM_NOTIFICATION_SOUND_BYTES))
    ).toBe(pathToFileURL(filePath).toString());
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

    expect(notificationSoundPlaybackOptions(config, regularFile())).toEqual({
      volume: 0.25,
      source: pathToFileURL(customPath).toString(),
    });
    expect(
      notificationSoundPlaybackOptions(config, () => {
        throw new Error('ENOENT');
      })
    ).toEqual({ volume: 0.25 });
  });
});
