import { EventEmitter } from 'events';

/** BetterMailspring updates are installed manually, never from the upstream release feed. */
export default class AutoUpdateManager extends EventEmitter {
  getState() {
    return 'unsupported';
  }

  check() {}

  install() {}
}
