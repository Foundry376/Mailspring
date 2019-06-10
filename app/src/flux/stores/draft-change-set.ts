import EventEmitter from 'events';
import { Message } from '../models/message';

export type MessageWithEditorState = Message & { bodyEditorState: any };

const MetadataChangePrefix = 'metadata.';

/**
Public: As the user interacts with the draft, changes are accumulated in the
DraftChangeSet associated with the store session.

This class used to be more complex - now it's mostly a holdover from when
we implemented undo/redo manually and just functions as a pass-through.

Section: Drafts
*/
const SaveAfterIdleMSec = 10000;
const SaveAfterIdleSlushMSec = 2000;

export class DraftChangeSet extends EventEmitter {
  callbacks = {
    onAddChanges: null,
    onCommit: null,
  };
  _timer = null;
  _timerTime = null;
  _timerStarted = null;
  _lastModifiedTimes: {
    body?: number;
    bodyEditorState?: number;
    pluginMetadata?: number;
  } = {};
  _lastCommitTime = 0;

  constructor(callbacks) {
    super();
    this.callbacks = callbacks;
  }

  cancelCommit() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timerStarted = null;
      this._timer = null;
    }
  }

  add(changes, { skipSaving = false } = {}) {
    if (!skipSaving) {
      changes.pristine = false;

      // update the per-attribute flags that track our dirty state
      for (const key of Object.keys(changes)) this._lastModifiedTimes[key] = Date.now();
      if (changes.bodyEditorState) this._lastModifiedTimes.body = Date.now();
      if (changes.body) this._lastModifiedTimes.bodyEditorState = Date.now();
      this.debounceCommit();
    }

    this.callbacks.onAddChanges(changes);
  }

  addPluginMetadata(pluginId, metadata) {
    this._lastModifiedTimes.pluginMetadata = Date.now();
    this.callbacks.onAddChanges({ [`${MetadataChangePrefix}${pluginId}`]: metadata });
    this.debounceCommit();
  }

  isDirty() {
    return this.dirtyFields().length > 0;
  }

  dirtyFields() {
    return Object.keys(this._lastModifiedTimes).filter(
      key => this._lastModifiedTimes[key] > this._lastCommitTime
    );
  }

  debounceCommit() {
    const now = Date.now();

    // If there's already a timer going and we started it recently,
    // it means it'll fire a bit early but that's ok. It's actually
    // pretty expensive to re-create a timer on every keystroke.
    if (this._timer && now - this._timerStarted < SaveAfterIdleSlushMSec) {
      return;
    }
    this.cancelCommit();
    this._timerStarted = now;
    this._timer = setTimeout(() => this.commit(), SaveAfterIdleMSec);
  }

  async commit() {
    if (this.dirtyFields().length === 0) return;
    if (this._timer) clearTimeout(this._timer);
    await this.callbacks.onCommit();
    this._lastCommitTime = Date.now();
  }
}
