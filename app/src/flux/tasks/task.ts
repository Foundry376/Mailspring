/* eslint no-unused-vars: 0*/
import _ from 'underscore';
import { Model } from '../models/model';
import * as Attributes from '../attributes';
import { generateTempId } from '../models/utils';

const Status = {
  Local: 'local', // means the task has NOT run the local phase yet
  Remote: 'remote',
  Complete: 'complete',
  Cancelled: 'cancelled',
};

export class Task extends Model {
  static Status = Status;
  static SubclassesUseModelTable: typeof Model = Task;

  static attributes = {
    ...Model.attributes,

    status: Attributes.String({
      queryable: true,
      modelKey: 'status',
    }),
    source: Attributes.String({
      modelKey: 'source',
    }),
    error: Attributes.Obj({
      modelKey: 'error',
    }),
  };

  status: string;
  source: string;
  error: string;

  // Public: Override the constructor to pass initial args to your Task and
  // initialize instance variables.
  //
  // **IMPORTANT:** if (you override the constructor, be sure to call)
  // `super`.
  //
  // On construction, all Tasks instances are given a unique `id`.
  constructor(data: { version?: string; status?: string; source?: string; error?: string } = {}) {
    super(data);
    this.status = this.status || Status.Local;
    this.id = this.id || generateTempId();
  }

  // Public: Returns true if the task has finished local execution. We have
  // a helper for this because historical naming choice here is poor. The
  // "local" state value means the task has /not/ run yet.
  hasRunLocally() {
    return this.status !== Status.Local;
  }

  // Public: Override to raise exceptions if your task is missing required
  // arguments or perform client-side business logic.
  willBeQueued() {}

  // Public: Return from `createIdenticalTask` and set a flag so your
  // `performLocal` and `performRemote` methods know that this is an undo
  // task.
  createUndoTask() {
    throw new Error('Unimplemented');
  }

  // Public: Return a deep-cloned task to be used for an undo task
  createIdenticalTask(): this {
    const json = this.toJSON();
    delete json.status;
    delete json.version;
    delete json.id;
    return new this.constructor(json) as this;
  }

  // Public: code to run if (someone tries to dequeue your task while it is)
  // in flight.
  //
  cancel() {}

  // Public: (optional) A string displayed to users when your task is run.
  //
  // When tasks are run, we automatically display a notification to users
  // of the form "label (numberOfImpactedItems)". if (this does not a return)
  // a string, no notification is displayed
  label() {}

  // Public: A string displayed to users indicating how many items your
  // task affected.
  numberOfImpactedItems() {
    return 1;
  }

  onError(err) {
    // noop
  }

  onSuccess() {
    // noop
  }
}
