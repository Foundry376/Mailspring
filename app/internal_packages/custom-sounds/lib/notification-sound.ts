import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export const NOTIFICATION_SOUND_VOLUME_CONFIG_KEY = 'core.notifications.soundVolume';
export const CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY = 'core.notifications.customSoundPath';
export const SUPPORTED_NOTIFICATION_SOUND_EXTENSIONS = ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac'];
export const MAX_CUSTOM_NOTIFICATION_SOUND_BYTES = 25 * 1024 * 1024;

type FileStats = { size: number; isFile: () => boolean };
type StatFile = (candidate: string) => FileStats;

export function isSupportedNotificationSoundPath(filePath: unknown): filePath is string {
  if (typeof filePath !== 'string' || !filePath) return false;
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return SUPPORTED_NOTIFICATION_SOUND_EXTENSIONS.includes(extension);
}

export function resolveCustomNotificationSound(
  filePath: unknown,
  statFile: StatFile = fs.statSync
): string | undefined {
  if (!isSupportedNotificationSoundPath(filePath) || !path.isAbsolute(filePath)) return undefined;

  try {
    const stats = statFile(filePath);
    if (!stats.isFile() || stats.size < 1 || stats.size > MAX_CUSTOM_NOTIFICATION_SOUND_BYTES) {
      return undefined;
    }
  } catch (error) {
    return undefined;
  }

  return pathToFileURL(path.resolve(filePath)).toString();
}

export function notificationSoundPlaybackOptions(
  config: { get: (key: string) => any },
  statFile: StatFile = fs.statSync
) {
  const volumePercent = Number(config.get(NOTIFICATION_SOUND_VOLUME_CONFIG_KEY));
  const source = resolveCustomNotificationSound(
    config.get(CUSTOM_NOTIFICATION_SOUND_CONFIG_KEY),
    statFile
  );
  return {
    volume: volumePercent / 100,
    ...(source ? { source } : {}),
  };
}
