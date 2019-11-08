import _ from 'underscore';
import Message from '../models/message';
import MessageStore from './message-store';
import DatabaseStore from './database-store';
import SanitizeTransformer from '../../services/sanitize-transformer';
import MessageBodyStore from './message-body-store';

class MessageBodyProcessor {
  constructor() {
    this._subscriptions = [];
    this.resetCache();

    this._timeouts = {};

    DatabaseStore.listen(change => {
      if (change.objectClass === Message.name) {
        change.objects.forEach(m => {
          const key = this._key(m);
          if (!this._recentlyProcessedD[key]) {
            return;
          }

          // Important—we debounce this a bit so that doing basic stuff, like archiving
          // a message, doesn't trigger a body update immediately.
          if (this._timeouts[key]) {
            clearTimeout(this._timeouts[key]);
          }
          this._timeouts[key] = setTimeout(() => {
            this.updateCacheForMessage(m);
          }, 250);
        });
      }
    });
  }

  resetCache() {
    // Store an object for recently processed items. Put the item reference into
    // both data structures so we can access it in O(1) and also delete in O(1)
    this._recentlyProcessedA = [];
    this._recentlyProcessedD = {};

    this._subscriptions.forEach(({ message, callback }) => {
      this.retrieve(message).then(callback);
    });
  }

  updateCacheForMessage = async changedMessage => {
    // reprocess any subscription using the new message data. Note that
    // changedMessage may not have a loaded body if it wasn't changed. In
    // that case, we use the previous body. Note: metadata changes, etc.
    // can cause the body to change, even if the HTML is identical!
    if (!changedMessage){
      return;
    }
    const subscriptions = this._subscriptions.filter(
      ({ message }) => message && changedMessage && message.id === changedMessage.id,
    );
    if (subscriptions.length === 0) {
      return;
    }

    const updatedMessage = changedMessage.clone();
    console.log(`updateCacheForMessage ${updatedMessage.id} fetch body`);
    const data = await MessageBodyStore.getPromiseBodyByMessageId(updatedMessage.id);
    console.log(`updateCacheForMessage ${updatedMessage.id} assign body`);
    updatedMessage.body = data.body;
    updatedMessage.isPlainText = !data.isHtml;
    updatedMessage.body =
      updatedMessage.body || (subscriptions[0] && subscriptions[0].message.body);
    if (!updatedMessage.body) {
      return;
    }

    const changedKey = this._key(changedMessage);

    // grab the old cached value if there is one
    const oldCacheRecord = this._recentlyProcessedD[changedKey];

    // remove the message from the cache so retrieve() will reprocess
    // and insert it into the cache again
    delete this._recentlyProcessedD[changedKey];
    this._recentlyProcessedA = this._recentlyProcessedA.filter(({ key }) => key !== changedKey);

    // run the processor
    const output = await this.retrieve(updatedMessage);

    // only trigger if the body has really changed
    if (!oldCacheRecord || output !== oldCacheRecord.body) {
      for (const subscription of subscriptions) {
        subscription.callback(output);
        subscription.message = updatedMessage;
      }
    }
  };

  version() {
    return this._version;
  }

  subscribe(message, sendInitial, callback) {
    const sub = { message, callback };

    if (sendInitial) {
      // Extra defer to ensure that subscribe never calls it's callback synchronously,
      // (In Node, callbacks should always be called after caller execution has finished)
      _.defer(() =>
        this.retrieve(message).then(output => {
          if (this._subscriptions.includes(sub)) {
            callback(output);
          }
        }),
      );
    }

    this._subscriptions.push(sub);
    return () => {
      this._subscriptions.splice(this._subscriptions.indexOf(sub), 1);
    };
  }

  async retrieve(message) {
    const key = this._key(message);
    if (this._recentlyProcessedD[key]) {
      return this._recentlyProcessedD[key].body;
    }

    const body = await this._process(message);
    this._addToCache(key, body);
    return body;
  }

  retrieveCached(message) {
    const key = this._key(message);
    if (this._recentlyProcessedD[key]) {
      return this._recentlyProcessedD[key].body;
    } else {
      this.retrieve(message);
    }
    return null;
  }

  // Private Methods

  _key(message) {
    // It's safe to key off of the message ID alone because we invalidate the
    // cache whenever the message is persisted to the database.
    return message.id;
  }

  _process(message) {
    // Sanitizing <script> tags, etc. isn't necessary because we use CORS rules
    // to prevent their execution and sandbox content in the iFrame, but we still
    // want to remove contenteditable attributes and other strange things.
    const processBody = () => {
      return SanitizeTransformer.run(message.body, SanitizeTransformer.Preset.UnsafeOnly).then(
        sanitized => {
          let body = sanitized;
          for (const extension of MessageStore.extensions()) {
            if (!extension.formatMessageBody) {
              continue;
            }

            // Give each extension the message object to process the body, but don't
            // allow them to modify anything but the body for the time being.
            const previousBody = body;
            try {
              const virtual = message.clone();
              virtual.body = body;
              extension.formatMessageBody({ message: virtual });
              body = virtual.body;
            } catch (err) {
              AppEnv.reportError(err);
              body = previousBody;
            }
          }
          return body;
        }
      );
    };
    if (typeof message.body !== 'string') {
      return new Promise(resolve => {
        AppEnv.logDebug(`message-body-processor fetch ${message.id} body`);
        MessageBodyStore.getPromiseBodyByMessageId(message.id).then(data => {
          message.body = data.body;
          message.isPlainText = !data.isHtml;
          AppEnv.logDebug(`message-body-processor ${message.id} assign body`);
          if (data.body) {
            processBody().then(body => {
              AppEnv.logDebug(`message-body-processor ${message.id} returning body`);
              resolve(body);
            });
          } else {
            resolve('');
          }
        });
      });
    }
    return processBody();
  }

  _addToCache(key, body) {
    if (this._recentlyProcessedA.length > 50) {
      const removed = this._recentlyProcessedA.pop();
      delete this._recentlyProcessedD[removed.key];
    }
    const item = { key, body };
    this._recentlyProcessedA.unshift(item);
    this._recentlyProcessedD[key] = item;
  }
}

const store = new MessageBodyProcessor();
export default store;
