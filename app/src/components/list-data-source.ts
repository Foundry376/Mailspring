/* eslint no-unused-vars: 0 */
import { EventEmitter } from 'events';
import ListSelection from './list-selection';
import Model from '../flux/models/model';

export default class ListDataSource {
  static get Empty() {
    return EmptyListDataSource;
  }

  _emitter = new EventEmitter();
  _cleanedup = false;
  selection = new ListSelection(this, arg => {
    this._emitter.emit('trigger', arg);
  });

  // Accessing Data

  trigger = arg => {
    this._emitter.emit('trigger', arg);
  };

  listen(callback, bindContext) {
    if (!(callback instanceof Function)) {
      throw new Error('ListDataSource: You must pass a function to `listen`');
    }
    if (this._cleanedup === true) {
      throw new Error(
        'ListDataSource: You cannot listen again after removing the last listener. This is an implementation detail.'
      );
    }

    const eventHandler = (...args) => {
      callback.apply(bindContext, args);
    };
    this._emitter.addListener('trigger', eventHandler);

    return () => {
      this._emitter.removeListener('trigger', eventHandler);
    };
  }

  loaded(): boolean {
    throw new Error('ListDataSource base class does not implement loaded()');
  }

  empty(): boolean {
    throw new Error('ListDataSource base class does not implement empty()');
  }

  get(idx): Model {
    throw new Error('ListDataSource base class does not implement get()');
  }

  getById(id): Model {
    throw new Error('ListDataSource base class does not implement getById()');
  }

  indexOfId(id): number {
    throw new Error('ListDataSource base class does not implement indexOfId()');
  }

  count(): number {
    throw new Error('ListDataSource base class does not implement count()');
  }

  itemsCurrentlyInViewMatching(matchFn): Model[] {
    throw new Error('ListDataSource base class does not implement itemsCurrentlyInViewMatching()');
  }

  setRetainedRange({ start, end }) {
    throw new Error('ListDataSource base class does not implement setRetainedRange()');
  }

  cleanup() {
    this._cleanedup = true;
    this.selection.cleanup();
  }
}

class EmptyListDataSource extends ListDataSource {
  loaded() {
    return true;
  }
  empty() {
    return true;
  }
  get() {
    return null;
  }
  getById() {
    return null;
  }
  indexOfId() {
    return -1;
  }
  count() {
    return 0;
  }
  itemsCurrentlyInViewMatching() {
    return [];
  }
  setRetainedRange() {
    return;
  }
}
