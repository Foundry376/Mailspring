import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export const NOTIFICATION_SOUND_VOLUME_CONFIG_KEY = 'core.notifications.soundVolume';
export const CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY = 'core.notifications.customSoundPath';
export const SUPPORTED_NOTIFICATION_SOUND_EXTENSIONS = ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac'];

export function isSupportedNotificationSoundPath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || !filePath) return false;
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return SUPPORTED_NOTIFICATION_SOUND_EXTENSIONS.includes(extension);
}

export function resolveCustomNotificationSound(
  filePath: unknown,
  fileExists: (candidate: string) => boolean = fs.existsSync
): string | undefined {
  if (!isSupportedNotificationSoundPath(filePath) || !fileExists(filePath)) return undefined;
  return pathToFileURL(path.resolve(filePath)).toString();
}

export function notificationSoundPlaybackOptions(
  config: { get: (key: string) => any },
  fileExists: (candidate: string) => boolean = fs.existsSync
) {
  const volumePercent = Number(config.get(NOTIFICATION_SOUND_VOLUME_CONFIG_KEY));
  const source = resolveCustomNotificationSound(
    config.get(CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY),
    fileExists
  );
  return {
    volume: volumePercent / 100,
    ...(source ? { source } : {}),
  };
}
