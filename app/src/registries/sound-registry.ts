import path from 'path';

class SoundRegistry {
  private _sounds = {};

  playSound(name: string) {
    if (AppEnv.inSpecMode()) {
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
