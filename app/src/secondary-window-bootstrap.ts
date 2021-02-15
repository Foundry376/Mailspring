/* eslint import/first: 0 */
/* eslint prefer-spread: 0 */

// TODO: Remove when upgrading to Electron 4
import fs from 'fs';
fs.statSyncNoException = function(...args) {
  try {
    return fs.statSync.apply(fs, args);
  } catch (e) {
    // pass
  }
  return false;
};

// Effectively all secondary windows are empty hot windows. We spawn the
// window and pre-load all of the basic javascript libraries (which takes a
// full second or so).
// #
// Eventually when `WindowManager::newWindow` gets called, instead of
// actually spawning a new window, we'll call
// `MailspringWindow::setLoadSettings` on the window instead. This will replace
// the window options, adjust params as necessary, and then re-load the
// plugins. Once `MailspringWindow::setLoadSettings` fires, the main AppEnv in
// the window will be notified via the `load-settings-changed` config
//
// Extend the standard promise class a bit
import './promise-extensions';

import AppEnvClass from './app-env';
window.AppEnv = new AppEnvClass();
AppEnv.startSecondaryWindow();

// Workaround for focus getting cleared upon window creation
const windowFocused = () => {
  window.removeEventListener('focus', windowFocused);
  return setTimeout(() => document.querySelector('body').focus(), 0);
};
window.addEventListener('focus', windowFocused);
