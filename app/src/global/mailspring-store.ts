import { EventEmitter } from 'events';

// A very, very simple Flux implementation

export default class MailspringStore {
  _emitter: EventEmitter;
  subscriptions: Array<{ stop: () => void; listenable: { hasListener?: (a: any) => boolean } }>;

  hasListener(listenable) {
    for (const sub of this.subscriptions || []) {
      if (
        sub.listenable === listenable ||
        (sub.listenable.hasListener && sub.listenable.hasListener(listenable))
      ) {
        return true;
      }
    }
    return false;
  }

  validateListening(listenable) {
    if (listenable === this) {
      return 'Listener is not able to listen to itself';
    }
    if (!(listenable.listen instanceof Function)) {
      console.log(require('util').inspect(listenable));
      console.log(new Error().stack);
      return listenable + ' is missing a listen method';
    }
    if (listenable.hasListener && listenable.hasListener(this)) {
      return 'Listener cannot listen to this listenable because of circular loop';
    }
  }

  listenTo(listenable, callback, defaultCallback = null) {
    this.subscriptions = this.subscriptions || [];

    const err = this.validateListening(listenable);
    if (err) {
      throw err;
    }

    this.fetchInitialState(listenable, defaultCallback);

    const resolvedCallback = this[callback] || callback;
    if (!resolvedCallback) {
      throw new Error('@listenTo called with undefined callback');
    }
    const desub = listenable.listen(resolvedCallback, this);

    const subscription = {
      stop: () => {
        const index = this.subscriptions.indexOf(subscription);
        if (index === -1) {
          throw new Error('Tried to remove listen already gone from subscriptions list!');
        }
        this.subscriptions.splice(index, 1);
        desub();
      },
      listenable,
    };
    this.subscriptions.push(subscription);

    return subscription;
  }

  stopListeningTo(listenable) {
    const subs = this.subscriptions || [];
    for (const sub of subs) {
      if (sub.listenable === listenable) {
        sub.stop();
        if (subs.indexOf(sub) !== -1) {
          throw new Error('Failed to remove listen from subscriptions list!');
        }
        return true;
      }
    }
    return false;
  }

  stopListeningToAll() {
    let remaining = undefined;
    const subs = this.subscriptions || [];
    while ((remaining = subs.length)) {
      subs[0].stop();
      if (subs.length !== remaining - 1) {
        throw new Error('Failed to remove listen from subscriptions list!');
      }
    }
  }

  fetchInitialState(listenable, defaultCallback = null) {
    defaultCallback = (defaultCallback && this[defaultCallback]) || defaultCallback;
    const me = this;
    if (defaultCallback instanceof Function && listenable.getInitialState instanceof Function) {
      const data = listenable.getInitialState();
      if (data && data.then instanceof Function) {
        data.then(() => defaultCallback.apply(me, arguments));
      } else {
        defaultCallback.call(this, data);
      }
    }
  }

  setupEmitter() {
    if (this._emitter) {
      return;
    }
    if (this._emitter == null) {
      this._emitter = new EventEmitter();
    }
    return this._emitter.setMaxListeners(250);
  }

  listen(callback: (...args: any[]) => void, bindContext: object = this) {
    if (!callback) {
      throw new Error('@listen called with undefined callback');
    }

    this.setupEmitter();

    let aborted = false;

    const eventHandler = (...args) => {
      if (aborted) {
        return;
      }
      return callback.apply(bindContext, args);
    };

    this._emitter.addListener('trigger', eventHandler);

    return () => {
      aborted = true;
      return this._emitter.removeListener('trigger', eventHandler);
    };
  }

  trigger(...args) {
    this.setupEmitter();
    return this._emitter.emit('trigger', ...args);
  }
}
