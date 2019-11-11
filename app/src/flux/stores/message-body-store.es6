import _ from 'underscore';
import MailspringStore from 'mailspring-store';
import DatabaseStore from './database-store';
import Actions from '../actions';
import Message from '../models/message';
import path from 'path';
import mkdirp from 'mkdirp';
import fs from 'fs';

const pathForFile = ({ messageId, basePath = '' }) => {
  if (!messageId) {
    return null;
  }
  const id = messageId.toLowerCase();
  return path.join(basePath, id.substr(0, 2), id.substr(2, 2), id);
};

class MessageBody {
  constructor({ messageId, basePath = '', isNew = false, body = '', storeTrigger }) {
    this.messageId = messageId;
    this.bodyString = '';
    this.fileBasePath = pathForFile({ messageId, basePath });
    this._isHtml = true;
    this._writing = false;
    this._writingWaiting = [];
    this._reading = false;
    this._readingWaiting = [];
    this._storeTrigger = storeTrigger;
    if (!isNew) {
      this._readBody();
    } else if (!body) {
      this.writeBody(body);
    }
  }

  trigger() {
    if (this._storeTrigger) {
      AppEnv.logDebug(`Triggered MessageBodyStore ${this.messageId}, body: ${this.bodyString}`);
      this._storeTrigger({
        messageId: this.messageId,
        body: this.bodyString,
        isHtml: this._isHtml,
      });
    }
  }

  pushCallBack(queue = '', cb) {
    if (queue === 'reading') {
      this._readingWaiting.push(cb);
    } else if (queue === 'writing') {
      this._writingWaiting.push(cb);
    }
  }

  popCallBack(queue = '') {
    if (queue === 'reading') {
      if (this._readingWaiting.length > 0) {
        AppEnv.logDebug(`Reading file ${this.messageId} stack popped`);
        return this._readingWaiting.shift();
      }
    } else if (queue === 'writing') {
      if (this._writingWaiting.length > 0) {
        AppEnv.logDebug(`Writing file ${this.messageId} statck poped`);
        return this._writingWaiting.shift();
      }
    }
    return null;
  }

  getBody() {
    AppEnv.logDebug(`get message ${this.messageId} body`);
    if (!this.bodyString) {
      this._readBody();
    }
    return {
      isHtml: this._isHtml,
      body: this.bodyString,
      messageId: this.messageId,
    };
  }

  getPromiseBody() {
    AppEnv.logDebug(`get message ${this.messageId} body promise`);
    if (!this.bodyString) {
      return this._readPromiseBody();
    }
    return Promise.resolve({
      isHtml: this._isHtml,
      body: this.bodyString,
      messageId: this.messageId,
    });
  }

  writeBody(body) {
    if (body !== this.bodyString) {
      this.bodyString = body;
      this._isHtml = true;
      return this._writeBodyThrottled();
    } else {
      return Promise.resolve();
    }
  }

  _writeBodyThrottled = ({ cbResolve, cbReject } = {}) => {
    if (this._writing) {
      return new Promise((resolve, reject) => {
        AppEnv.logDebug(`Writing to file ${this.messageId} deferred`);
        this.pushCallBack('writing', { resolve, reject });
      });
    }
    this._writing = true;
    return new Promise((resolve, reject) => {
      const writeToFile = () => {
        fs.writeFile(
          path.join(this.fileBasePath, '1.html'),
          this.bodyString,
          { encoding: 'utf8' },
          err => {
            this._writing = false;
            if (err) {
              AppEnv.reportError(err, {
                errorData: { messageId: this.messageId, bodyString: this.bodyString },
              });
              reject();
              if (cbReject) {
                cbReject();
              }
            } else {
              AppEnv.logDebug(`Writing to file ${this.messageId} finished, content: ${this.bodyString}`);
              resolve();
              if (cbResolve) {
                cbResolve();
              }
            }
            if (this._writingWaiting.length > 0) {
              const cb = this.popCallBack('writing');
              this._writeBodyThrottled({ cbResolve: cb.resolve, cbReject: cb.reject });
            }
          }
        );
      };
      fs.stat(this.fileBasePath, (err, stats) => {
        if (err) {
          if (err && err.code === 'ENOENT') {
            AppEnv.logDebug(`creating parent dir ${this.fileBasePath}`);
            fs.mkdir(this.fileBasePath, { recursive: true }, err => {
              if (!err) {
                writeToFile();
              }
            });
          } else {
            AppEnv.reportError(
              new Error(
                `Cannot create parent folder ${this.fileBasePath} for file: ${this.messageId}`,
              ),
              { errorData: err.code },
              { grabLogs: true }
            );
            reject();
          }
        } else {
          if (stats.isDirectory()) {
            writeToFile();
          } else {
            AppEnv.reportError(
              new Error(`Parent path is not a dir: ${this.messageId}`),
              {},
              { grabLogs: true }
            );
            reject();
          }
        }
      });
    });
  };

  _readBodyFile = ({ cbResolve, cbReject } = {}) => {
    AppEnv.logDebug(`Reading file ${this.messageId}`);
    fs.readFile(path.join(this.fileBasePath, '1.html'), 'utf8', (err, data) => {
      if (err) {
        AppEnv.logDebug(`Reading ${this.messageId} as html failed`);
        fs.readFile(path.join(this.fileBasePath, '1.txt'), 'utf8', (err, data) => {
          this._reading = false;
          if (err) {
            AppEnv.logDebug(`Reading ${this.messageId} as text failed`);
            if (cbResolve) {
              cbResolve({ isHtml: this._isHtml, body: this.bodyString, messageId: this.messageId });
            }
            if (this._readingWaiting.length > 0) {
              AppEnv.logDebug(`Popping reading stack`);
              const cb = this.popCallBack('reading');
              this._readBodyFile({ cbResolve: cb.resolve, cbReject: cb.reject });
            }
            return;
          }
          AppEnv.logDebug(`Reading ${this.messageId} as text succeeded output: ${data}`);
          this.bodyString = data;
          this._isHtml = false;
          if (cbResolve) {
            cbResolve({ isHtml: false, body: data, messageId: this.messageId });
          }
          // this.trigger({ messageId: this.messageId, isHtml: this._isHtml, body: this.bodyString });
          if (this._readingWaiting.length > 0) {
            AppEnv.logDebug(`Popping reading stack`);
            const cb = this.popCallBack('reading');
            this._readBodyFile({ cbResolve: cb.resolve, cbReject: cb.reject });
          }
        });
      } else {
        AppEnv.logDebug(`Reading ${this.messageId} as html succeeded output: ${data}`);
        this._reading = false;
        this.bodyString = data;
        this._isHtml = true;
        if (cbResolve) {
          cbResolve({ isHtml: true, body: data, messageId: this.messageId });
        }
        // this.trigger({ messageId: this.messageId, isHtml: this._isHtml, body: this.bodyString });
        if (this._readingWaiting.length > 0) {
          const cb = this.popCallBack('reading');
          this._readBodyFile({ cbResolve: cb.resolve, cbReject: cb.reject });
        }
      }
    });
  };
  _readBody = () => {
    if (this._reading) {
      AppEnv.logDebug(`reading to file ${this.messageId} deferred`);
      this.pushCallBack('reading', {});
      return;
    }
    this._reading = true;
    this._readBodyFile();
  };
  _readPromiseBody = () => {
    if (this._reading) {
      return new Promise((resolve, reject) => {
        AppEnv.logDebug(`reading to file ${this.messageId} deferred`);
        this.pushCallBack('reading', { resolve, reject });
      });
    }
    this._reading = true;
    return new Promise((resolve, reject) => {
      this._readBodyFile({ cbResolve: resolve, cbReject: reject });
    });
  };
}

class MessageBodyCache {
  constructor({ trigger } = {}) {
    this._message = {};
    this._lastAccessTime = {};
    this._cachSize = 100;
    this._trigger = trigger;
    AppEnv.logDebug(`MessageBodyCache created`);
  }

  shrinkCache() {
    const keys = Object.keys(this._lastAccessTime);
    if (keys.length > this._cachSize) {
      let lru = keys[0];
      for (let key of keys) {
        if (this._lastAccessTime[lru] > this._lastAccessTime[key]) {
          lru = key;
        }
      }
      delete this._lastAccessTime[lru];
      delete this._message[lru];
      AppEnv.logDebug(`removed cache ${lru}`);
    }
  }

  hasId(messageId) {
    return !!this._lastAccessTime[messageId];
  }
  _getBody({ messageId, basePath, ...rest } = {}) {
    this._lastAccessTime[messageId] = Date.now();
    if (!this._message[messageId]) {
      this._message[messageId] = new MessageBody({
        messageId,
        basePath,
        ...rest,
        storeTrigger: this._trigger,
      });
      AppEnv.logDebug(`cache for ${messageId} added`);
      this.shrinkCache();
    }
  }

  getBody({ messageId, basePath, ...rest } = {}) {
    this._getBody({ messageId, basePath, ...rest });
    return this._message[messageId].getBody();
  }
  getPromiseBody({ messageId, basePath, ...rest } = {}) {
    this._getBody({ messageId, basePath, ...rest });
    return this._message[messageId].getPromiseBody();
  }

  writeBody({ messageId, body, isNew, basePath } = {}) {
    this._lastAccessTime[messageId] = Date.now();
    if (!this._message[messageId]) {
      this._message[messageId] = new MessageBody({
        messageId,
        isNew,
        body,
        basePath,
        storeTrigger: this._trigger,
      });
      AppEnv.logDebug(`cache for ${messageId} added`);
      this.shrinkCache();
    }
    return this._message[messageId].writeBody(body);
  }

  clearCache() {
    this._lastAccessTime = {};
    this._message = {};
  }
}

class MessageBodyStore extends MailspringStore {
  constructor() {
    super();
    this._filesDirectory = path.join(AppEnv.getConfigDirPath(), 'files');
    AppEnv.logDebug(`body file path created ${this._filesDirectory}`);
    mkdirp(this._filesDirectory);
    this._bodyCache = new MessageBodyCache({ trigger: this.trigger.bind(this) });
    this._registerListener();
  }

  _registerListener() {
    this.listenTo(DatabaseStore, this._onDataChange);
    this.listenTo(Actions.syncDraftToFile, this._syncDraftToFile);
  }

  _syncDraftToFile = ({ syncBackDraftTask = {}, isNew = false } = {}) => {
    AppEnv.logDebug(`Writing draft task to file ${syncBackDraftTask.headerMessageId}`);
    this.writeBodyByMessageId({
      messageId: syncBackDraftTask.draft.id,
      body: syncBackDraftTask.draft.body,
      isNew,
    }).then(() => {
      AppEnv.logDebug(`Sending syncBackDraftTask task to native ${syncBackDraftTask.headerMessageId}`);
      Actions.queueTask(syncBackDraftTask);
    });
  };

  _onDataChange = change => {
    if (change.objectClass === Message.name && change.type === 'persist') {
      change.objects.forEach(m => {
        if (this.isCachePresent(m.id)) {
          this.getBodyByMessageId(m.id);
        }
      });
    }
  };

  isCachePresent(messageId) {
    return this._bodyCache.hasId(messageId);
  }

  getBodyByMessageId(messageId) {
    return this._bodyCache.getBody({ messageId, basePath: this._filesDirectory });
  }
  getPromiseBodyByMessageId(messageId){
    return this._bodyCache.getPromiseBody({ messageId, basePath: this._filesDirectory });
  }

  writeBodyByMessageId({ messageId, body, isNew }) {
    return this._bodyCache.writeBody({ messageId, body, basePath: this._filesDirectory, isNew });
  }
}

export default new MessageBodyStore();
