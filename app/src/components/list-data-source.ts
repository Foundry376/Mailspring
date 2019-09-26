/* eslint no-unused-vars: 0 */
import { EventEmitter } from 'events';
import ListSelection from './list-selection';
import { Model } from '../flux/models/model';

export default class ListDataSource {
  // getters prevent use before decl

  static get Empty() {
    return EmptyListDataSource;
  }

  static get DumbArrayDataSource() {
    return DumbArrayDataSource;
  }

  _emitter = new EventEmitter();
  _cleanedup = false;
  selection = new ListSelection(this, arg => {
    this._emitter.emit('trigger', arg);
  });

  // Accessing Data

  trigger = (arg?: any) => {
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
  setRetainedRange() {}
}

class DumbArrayDataSource<T extends Model> extends ListDataSource {
  _items: T[] = [];

  setItems(items: T[]) {
    this._items = items;
    this.trigger();
  }
  loaded() {
    return true;
  }
  empty() {
    return this._items.length === 0;
  }
  get(idx: number) {
    return this._items[idx];
  }
  getById(id: string) {
    return this._items.find(i => i.id === id);
  }
  indexOfId(id: string) {
    return this._items.findIndex(i => i.id === id);
  }
  count() {
    return this._items.length;
  }
  itemsCurrentlyInViewMatching(matchFn: (item: T) => boolean) {
    return this._items.filter(matchFn);
  }
  setRetainedRange() {}
}
