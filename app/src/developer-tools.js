const { app } = require('electron');

/**
 * Whether development mode and the developer console may be used at all.
 *
 * Only an unpackaged build allows them. A packaged release honors neither `--dev` nor
 * `--test` and offers no way to open devtools, because the console reads and rewrites
 * everything the window can — message bodies, the local mail database, the access tokens
 * in the keychain — and anything a user can be talked into typing there, an attacker can
 * too. A release build that can be switched into a debug build on the command line is a
 * debug build, so the switch is absent rather than merely hidden.
 *
 * Plugin and theme authors get all of it back by running from a source checkout
 * (`npm start`) or an unpackaged build, where this returns true.
 */
function developerToolsAvailable() {
  const electronApp = process.type === 'renderer' ? require('@electron/remote').app : app;
  return !electronApp.isPackaged;
}

module.exports = { developerToolsAvailable };
