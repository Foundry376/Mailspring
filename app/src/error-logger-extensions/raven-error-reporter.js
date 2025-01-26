/* eslint global-require: 0 */
const { getMac } = require('getmac');
const crypto = require('crypto');
const Raven = require('raven');

module.exports = class RavenErrorReporter {
  constructor({ inSpecMode, inDevMode, resourcePath }) {
    this.inSpecMode = inSpecMode;
    this.inDevMode = inDevMode;
    this.resourcePath = resourcePath;
    this.deviceHash = 'Unknown Device Hash';

    if (!this.inSpecMode) {
      try {
        getMac((err, macAddress) => {
          if (!err && macAddress) {
            this.deviceHash = crypto
              .createHash('sha256')
              .update(macAddress)
              .digest('hex');
          }
          this._setupSentry();
        });
      } catch (err) {
        console.error(err);
        this._setupSentry();
      }
    }
  }

  getVersion() {
    return process.type === 'renderer' ? AppEnv.getVersion() : require('electron').app.getVersion();
  }

  reportError(err, extra) {
    if (this.inSpecMode || this.inDevMode) {
      return;
    }

    // Skip some very noisy issues
    const str = `${err}`.toLowerCase();
    if (['resize observer', 'resizeobserver', 'enoent'].includes(str)) {
      return;
    }

    Raven.captureException(err, {
      extra: extra,
      tags: {
        platform: process.platform,
        version: this.getVersion(),
      },
    });
  }

  _setupSentry() {
    Raven.disableConsoleAlerts();
    Raven.config(
      'https://2c54d9a7349ab0fa781878a84744f7fc@o70907.ingest.us.sentry.io/4508712413233152',
      {
        name: this.deviceHash,
        release: this.getVersion(),
      }
    ).install();

    // Just give us something random that we can use to tell how many users are impacted
    // by each bug. This is important because sometimes one user will hit an exception 1,000
    // times and skew the Sentry data.
    Raven.mergeContext({
      user: {
        id: this.deviceHash,
      },
    });

    Raven.on('error', e => {
      console.log(`Raven: ${e.statusCode} - ${e.reason}`);
    });
  }
};
