import path from 'path';
import NativeNotifications from '../native-notifications';

export interface SoundPlaybackOptions {
  volume?: number;
  source?: string;
}

export function normalizeSoundVolume(volume: unknown): number {
  if (volume === undefined) return 1;

  const numericVolume = Number(volume);
  if (!Number.isFinite(numericVolume)) return 1;
  return Math.min(1, Math.max(0, numericVolume));
}

export class SoundRegistry {
  private _sounds = {};

  private _audioForSource(src: string | string[], volume: number) {
    const audio = new Audio();
    const { resourcePath } = AppEnv.getLoadSettings();

    if (typeof src === 'string') {
      if (/^(mailspring|file|data|blob):/.test(src)) {
        audio.src = src;
      } else {
        audio.src = path.join(resourcePath, 'static', 'sounds', src);
      }
    } else if (src instanceof Array) {
      const args = [resourcePath].concat(src);
      audio.src = path.join.apply(this, args);
    }
    audio.volume = volume;
    audio.autoplay = true;
    return audio;
  }

  async playSound(name: string, options: SoundPlaybackOptions = {}) {
    if (AppEnv.inSpecMode()) {
      return;
    }
    if (await NativeNotifications.doNotDisturb()) {
      return;
    }
    const registeredSource = this._sounds[name];
    const src = options.source || registeredSource;
    if (!src) {
      return;
    }

    const volume = normalizeSoundVolume(options.volume);
    try {
      await this._audioForSource(src, volume).play();
    } catch (error) {
      if (options.source && registeredSource && options.source !== registeredSource) {
        try {
          await this._audioForSource(registeredSource, volume).play();
          return;
        } catch (fallbackError) {
          console.warn(`Unable to play the default sound '${name}'.`, fallbackError);
          return;
        }
      }
      console.warn(`Unable to play sound '${name}'.`, error);
    }
  }

  register(name: string | { [key: string]: string[] }, rpath?: string) {
    if (typeof name === 'object') {
      for (const [key, kpath] of Object.entries(name)) {
        this._sounds[key] = kpath;
      }
    } else if (typeof name === 'string') {
      this._sounds[name] = rpath;
    }
  }

  unregister(name: string[] | string) {
    if (name instanceof Array) {
      for (const key of name) {
        delete this._sounds[key];
      }
    } else if (typeof name === 'string') {
      delete this._sounds[name];
    }
  }
}

export default new SoundRegistry();
