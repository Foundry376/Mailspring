import _ from 'underscore';
import Message from '../models/message';
import MessageStore from './message-store';
import DatabaseStore from './database-store';
import SanitizeTransformer from '../../services/sanitize-transformer';

class MessageBodyProcessor {
  MAX_DISPLAY_LENGTH = 300000;

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
    const subscriptions = this._subscriptions.filter(
      ({ message }) => message.id === changedMessage.id
    );

    const updatedMessage = changedMessage.clone();
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
    if (!oldCacheRecord || output.body !== oldCacheRecord.body) {
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
        })
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

    const output = await this._process(message);
    this._addToCache(key, output);
    return output;
  }

  retrieveCached(message) {
    const key = this._key(message);
    if (this._recentlyProcessedD[key]) {
      return this._recentlyProcessedD[key];
    }
    return null;
  }

  // Private Methods

  _key(message) {
    // It's safe to key off of the message ID alone because we invalidate the
    // cache whenever the message is persisted to the database.
    return message.id;
  }

  async _process(message) {
    if (typeof message.body !== 'string') {
      return { body: '', clipped: false };
    }

    let body = message.body;
    let clipped = false;
    if (body.length > this.MAX_DISPLAY_LENGTH) {
      // We clip messages at 300,000 characters to avoid bringing Chromium to
      // a crawl. We will display a "message clipped notice" later.
      body = body.substr(0, this.MAX_DISPLAY_LENGTH);
      clipped = true;
    }

    // Sanitizing <script> tags, etc. isn't necessary because we use CORS rules
    // to prevent their execution and sandbox content in the iFrame, but we still
    // want to remove contenteditable attributes and other strange things.
    body = await SanitizeTransformer.run(body, SanitizeTransformer.Preset.UnsafeOnly);

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

    return { body, clipped };
  }

  _addToCache(key, { body, clipped }) {
    if (this._recentlyProcessedA.length > 50) {
      const removed = this._recentlyProcessedA.pop();
      delete this._recentlyProcessedD[removed.key];
    }
    const item = { key, body, clipped };
    this._recentlyProcessedA.unshift(item);
    this._recentlyProcessedD[key] = item;
  }
}

const store = new MessageBodyProcessor();
export default store;
