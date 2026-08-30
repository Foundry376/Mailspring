import path from 'path';
import NativeNotifications from '../native-notifications';

export interface SoundPlaybackOptions {
  volume?: number;
}

export function normalizeSoundVolume(volume: unknown): number {
  if (volume === undefined) return 1;

  const numericVolume = Number(volume);
  if (!Number.isFinite(numericVolume)) return 1;
  return Math.min(1, Math.max(0, numericVolume));
}

export class SoundRegistry {
  private _sounds = {};

  async playSound(name: string, options: SoundPlaybackOptions = {}) {
    if (AppEnv.inSpecMode()) {
      return;
    }
    if (await NativeNotifications.doNotDisturb()) {
      return;
    }
    const src = this._sounds[name];
    if (!src) {
      return;
    }

    const a = new Audio();
    const { resourcePath } = AppEnv.getLoadSettings();

    if (typeof src === 'string') {
      if (src.indexOf('mailspring://') === 0) {
        a.src = src;
      } else {
        a.src = path.join(resourcePath, 'static', 'sounds', src);
      }
    } else if (src instanceof Array) {
      const args = [resourcePath].concat(src);
      a.src = path.join.apply(this, args);
    }
    a.volume = normalizeSoundVolume(options.volume);
    a.autoplay = true;
    a.play();
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
