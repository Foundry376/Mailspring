/* eslint import/first: 0 */

// TODO: Remove when upgrading to Electron 4
import fs from 'fs';
fs.statSyncNoException = function(...args) {
  try {
    return fs.statSync.apply(fs, args);
  } catch (e) {}
  return false;
};

// Extend the standard promise class a bit
import './promise-extensions';

import AppEnvClass from './app-env';
window.AppEnv = new AppEnvClass();
AppEnv.startRootWindow();

// Workaround for focus getting cleared upon window creation
const windowFocused = () => {
  window.removeEventListener('focus', windowFocused);
  return setTimeout(() => {
    const elt = document.getElementById('sheet-container');
    if (elt) elt.focus();
  }, 0);
};
window.addEventListener('focus', windowFocused);
