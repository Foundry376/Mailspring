/* eslint global-require: 0 */
const { getDeviceHash, getOSInfo } = require('../system-utils');
const _ = require('underscore');
const request = require('request');
const fs = require('fs');
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
    if (this.inSpecMode ) {
      return;
    }
    this._report(err, extra, 'ERROR');
  }

  reportWarning(err, extra) {
    if (this.inSpecMode || this.inDevMode) {
      return;
    }
    this._report(err, extra, 'WARNING');
  }
  reportLog(err, extra){
    if (this.inSpecMode ) {
      return;
    }
    this._report(err, extra, 'LOG');
  }
  _report(err, extra, type = 'LOG'){
    if (!extra.osInfo) {
      extra.osInfo = getOSInfo();
    }
    const now = Date.now();
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
          level: type,
          time: now,
          version: this.getVersion(),
          data: {
            time: now,
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
        level: type,
        time: now,
        version: this.getVersion(),
        data: {
          time: now,
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
    // var content = JSON.stringify(this.errorStack);
    // var options = {
    //   host: 'cp.stag.easilydo.cc',
    //   port: 443,
    //   path: '/log/',
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Content-Length': content.length,
    //   },
    // };
    const formify = obj => {
      const ret = {};
      for (let key in obj){
        if (key !== 'data' && key !== 'files') {
          ret[key] = obj[key];
        }
      }
      const data = obj.data;
      if(data && data.extra){
        if(data.extra.osInfo){
          for (let key in data.extra.osInfo){
            ret['osInfo_'+key] = data.extra.osInfo[key];
          }
          delete data.extra.osInfo;
        }
        for(let key in data.extra){
          if(typeof data.extra[key] !== 'string' && typeof data.extra[key] !== 'number'){
            ret[key] = JSON.stringify(data.extra[key]);
          }else{
            ret[key] = data.extra[key];
          }
        }
      }
      if (data && data.error) {
        if (data.error.stack) {
          ret.stack = data.error.stack;
        }
        if (data.error.message) {
          ret.message = data.error.message;
        }
      }
      if (Array.isArray(obj.files)) {
        ret.files = [];
        obj.files.forEach(filePath => {
          ret.files.push(fs.createReadStream(filePath));
        });
      }
      return ret;
    };
    this.errorStack.forEach(stack => {
      const tmp = formify(stack);
      request.post({url: 'https://cp.stag.easilydo.cc/api/log2/', formData: tmp}, (err, httpResponse, body) => {
        if (err){
          console.log(`\n---> \nupload failed: ${err}`);
        }
        console.log(`\n---> \nupload success ${body}`);
      });
    })
    // var req = https.request(options, function(res) {
    //   var _data = '';
    //   res.on('error', function(error) {
    //     console.log(error);
    //   });
    //
    //   res.on('data', function(chunk) {
    //     _data += chunk;
    //   });
    //
    //   res.on('end', function() {
    //     // console.log("\n--->>\nresult:", _data);
    //   });
    // });
    // req.write(content);
    // req.end();
    this.errorStack = [];
  }
};
