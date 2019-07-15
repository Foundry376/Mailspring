/* eslint global-require: 0 */
const { getDeviceHash, getOSInfo } = require('../system-utils');
const _ = require('underscore');
var https = require('https');
module.exports = class EdisonErrorReporter {
  constructor({ inSpecMode, inDevMode, resourcePath }) {
    this.inSpecMode = inSpecMode;
    this.inDevMode = inDevMode;
    this.resourcePath = resourcePath;
    this.deviceHash = 'Unknown Device Hash';
    this.errorStack = [];
    this._lazySend = _.throttle(this._send, 2000);

    if (!this.inSpecMode) {
      try {
        this.deviceHash = '';
        getDeviceHash().then(value => {
          this.deviceHash = value;
        });
      } catch (err) {
        console.error(err);
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
    if (!extra.osInfo) {
      extra.osInfo = getOSInfo();
    }
    if (this.deviceHash === '') {
      getDeviceHash().then(value => {
        this.deviceHash = value;
        return Promise.resolve();
      }, () => {
        this.deviceHash = 'Unknown Device Hash';
      }).then(() => {
        this._sendErrorToServer({
          app: 'DESKTOP',
          platform: process.platform,
          device_id: this.deviceHash,
          level: 'ERROR',
          time: new Date().getTime(),
          version: this.getVersion(),
          data: {
            version: this.getVersion(),
            error: err,
            extra: extra,
          },
        });
      });
    } else {
      this._sendErrorToServer({
        app: 'DESKTOP',
        platform: process.platform,
        device_id: this.deviceHash,
        level: 'ERROR',
        time: new Date().getTime(),
        version: this.getVersion(),
        data: {
          version: this.getVersion(),
          error: err,
          extra: extra,
        },
      });
    }
  }

  reportWarning(err, extra) {
    if (this.inSpecMode || this.inDevMode) {
      return;
    }
    if (!extra.osInfo) {
      extra.osInfo = getOSInfo();
    }
    if (this.deviceHash === '') {
      getDeviceHash().then(value => {
        this.deviceHash = value;
        return Promise.resolve();
      }, () => {
        this.deviceHash = 'Unknown Device Hash';
      }).then(() => {
        this._sendErrorToServer({
          app: 'DESKTOP',
          platform: process.platform,
          device_id: this.deviceHash,
          level: 'WARNING',
          time: new Date().getTime(),
          version: this.getVersion(),
          data: {
            version: this.getVersion(),
            error: err,
            extra: extra,
          },
        });
      });
    } else {
      this._sendErrorToServer({
        app: 'DESKTOP',
        platform: process.platform,
        device_id: this.deviceHash,
        level: 'WARNING',
        time: new Date().getTime(),
        version: this.getVersion(),
        data: {
          version: this.getVersion(),
          error: err,
          extra: extra,
        },
      });
    }
  }

  _sendErrorToServer(post_data) {
    this.errorStack.push(post_data);
    this._lazySend();
  }

  _send() {
    var content = JSON.stringify(this.errorStack);
    var options = {
      host: 'cp.stag.easilydo.cc',
      port: 443,
      path: '/log/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': content.length,
      },
    };

    var req = https.request(options, function(res) {
      var _data = '';
      res.on('error', function(error) {
        console.error(error);
      });

      res.on('data', function(chunk) {
        _data += chunk;
      });

      res.on('end', function() {
        // console.log("\n--->>\nresult:", _data);
      });
    });
    req.write(content);
    req.end();
    this.errorStack = [];
  }
};
