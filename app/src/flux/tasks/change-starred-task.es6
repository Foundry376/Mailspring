/* eslint no-unused-vars: 0*/
import _ from 'underscore';
import Attributes from '../attributes';
import Thread from '../models/thread';
import Actions from '../actions';
import DatabaseStore from '../stores/database-store';
import ChangeMailTask from './change-mail-task';

export default class ChangeStarredTask extends ChangeMailTask {
  static attributes = Object.assign({}, ChangeMailTask.attributes, {
    starred: Attributes.Boolean({
      modelKey: 'starred',
    }),
  });

  label() {
    return this.starred ? 'Starring' : 'Unstarring';
  }

  description() {
    const count = this.threadIds.length;
    const type = count > 1 ? 'threads' : 'thread';

    if (this.isUndo) {
      return `Undoing changes to ${count} ${type}`;
    }

    const verb = this.starred ? 'Starred' : 'Unstarred';
    if (count > 1) {
      return `${verb} ${count} ${type}`;
    }
    return `${verb}`;
  }

  willBeQueued() {
    if (this.threadIds.length === 0) {
      throw new Error('ChangeStarredTask: You must provide a `threads` Array of models or IDs.');
    }
    super.willBeQueued();
  }

  createUndoTask() {
    const task = super.createUndoTask();
    task.starred = !this.starred;
    return task;
  }
}
