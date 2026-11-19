/**
 * Takes the single-instance lock and passes each later launch's arguments to `onSecondInstance`.
 * Returns false when another instance already holds the lock.
 *
 * The arguments travel as `additionalData`, which Electron's `second-instance` documentation
 * advises when they must arrive exactly as given. The command line Chromium forwards moves
 * every switch ahead of the bare arguments, so a launcher's `--require <install>/mailspring.js`
 * arrives as `--require` and a stray path, which reads as a file to attach to a new message.
 */
function claimSingleInstance(app, argv, onSecondInstance) {
  if (!app.requestSingleInstanceLock({ argv })) {
    return false;
  }
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    // A launch from an install that predates this lock data sends none.
    const sentArgv = additionalData && additionalData.argv;
    onSecondInstance(isArgv(sentArgv) ? sentArgv : commandLine);
  });
  return true;
}

// `additionalData` is whatever JSON the launching process chose to send, and parseCommandLine
// assumes an array of strings: anything else would throw in the main process.
function isArgv(value) {
  return Array.isArray(value) && value.every(arg => typeof arg === 'string');
}

module.exports = { claimSingleInstance };
