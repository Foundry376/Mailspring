/*
 * decaffeinate suggestions:
 * DS201: Simplify complex destructure assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import _ from 'underscore';

declare global {
  export const advanceClock: (delta?: number) => void;
  export const resetTime: () => void;
  export const enableSpies: () => void;
}
// Public: To make specs easier to test, we make all asynchronous behavior
// actually synchronous. We do this by overriding all global timeout and
// Promise functions.
//
// You must now manually call `advanceClock()` in order to move the "clock"
// forward.
class TimeOverride {
  static initClass() {
    this.advanceClock = (delta = 1) => {
      this.now += delta;
      const callbacks = [];

      if (this.timeouts == null) {
        this.timeouts = [];
      }
      this.timeouts = this.timeouts.filter((...args) => {
        let id, strikeTime;
        let callback;
        [id, strikeTime, callback] = Array.from(args[0]);
        if (strikeTime <= this.now) {
          callbacks.push(callback);
          return false;
        } else {
          return true;
        }
      });

      for (let callback of callbacks) {
        callback();
      }
    };

    this.resetTime = () => {
      this.now = 0;
      this.timeoutCount = 0;
      this.intervalCount = 0;
      this.timeouts = [];
      this.intervalTimeouts = {};
      this.originalPromiseScheduler = null;
    };

    this.enableSpies = () => {
      window.advanceClock = this.advanceClock;

      window.originalSetTimeout = window.setTimeout;
      window.originalSetInterval = window.setInterval;
      spyOn(window, 'setTimeout').and.callFake(this._fakeSetTimeout);
      spyOn(window, 'clearTimeout').and.callFake(this._fakeClearTimeout);
      spyOn(window, 'setInterval').and.callFake(this._fakeSetInterval);
      spyOn(window, 'clearInterval').and.callFake(this._fakeClearInterval);
      spyOn(_._, 'now').and.callFake(() => this.now);
    };

    // spyOn(Date, "now").and.callFake => @now
    // spyOn(Date.prototype, "getTime").and.callFake => @now

    this.disableSpies = () => {
      window.advanceClock = null;

      jasmine.unspy(window, 'setTimeout');
      jasmine.unspy(window, 'clearTimeout');
      jasmine.unspy(window, 'setInterval');
      jasmine.unspy(window, 'clearInterval');

      jasmine.unspy(_._, 'now');
    };

    this._fakeSetTimeout = (callback, ms) => {
      const id = ++this.timeoutCount;
      this.timeouts.push([id, this.now + ms, callback]);
      return id;
    };

    this._fakeClearTimeout = idToClear => {
      if (this.timeouts == null) {
        this.timeouts = [];
      }
      this.timeouts = this.timeouts.filter(function(...args) {
        const [id] = args[0];
        return id !== idToClear;
      });
    };

    this._fakeSetInterval = (callback, ms) => {
      const id = ++this.intervalCount;
      var action = () => {
        callback();
        this.intervalTimeouts[id] = this._fakeSetTimeout(action, ms);
      };
      this.intervalTimeouts[id] = this._fakeSetTimeout(action, ms);
      return id;
    };

    this._fakeClearInterval = idToClear => {
      this._fakeClearTimeout(this.intervalTimeouts[idToClear]);
    };
  }

  static resetSpyData() {
    if (typeof window.setTimeout.reset === 'function') {
      window.setTimeout.reset();
    }
    if (typeof window.clearTimeout.reset === 'function') {
      window.clearTimeout.reset();
    }
    if (typeof window.setInterval.reset === 'function') {
      window.setInterval.reset();
    }
    if (typeof window.clearInterval.reset === 'function') {
      window.clearInterval.reset();
    }
    if (typeof Date.now.reset === 'function') {
      Date.now.reset();
    }
    if (typeof Date.prototype.getTime.reset === 'function') {
      Date.prototype.getTime.reset();
    }
  }
}
TimeOverride.initClass();
export default TimeOverride;
