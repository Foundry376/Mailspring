import EventEmitter from 'events';

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
  _commitPromise: Promise<any> = null;

  constructor(callbacks) {
    super();
    this.callbacks = callbacks;
  }

  clearDelayedCommit() {
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
      for (const key of Object.keys(changes)) this._lastModifiedTimes[key] = performance.now();
      if (changes.bodyEditorState) this._lastModifiedTimes.body = performance.now();
      if (changes.body) this._lastModifiedTimes.bodyEditorState = performance.now();
      this.debounceCommit();
    }

    this.callbacks.onAddChanges(changes);
  }

  addPluginMetadata(pluginId, metadata) {
    this._lastModifiedTimes.pluginMetadata = performance.now();
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
    this.clearDelayedCommit();
    this._timerStarted = now;
    this._timer = setTimeout(() => this.commit(), SaveAfterIdleMSec);
  }

  /*
  The `commit` method flushes the changes from the editor to SQLite. It's extremely important
  that this method does not resolve until everything has been saved. However:

  - A commit (triggered by a timer) may already be running when this function is called.
    We may not need to save again, but we need to block until that save completes.
  */
  async commit() {
    if (this._commitPromise) {
      await this._commitPromise;
    }

    if (this.dirtyFields().length > 0) {
      this.clearDelayedCommit();
      this._commitPromise = this.callbacks.onCommit();
      await this._commitPromise;
      this._lastCommitTime = performance.now();
      this._commitPromise = null;
    }
  }
}
