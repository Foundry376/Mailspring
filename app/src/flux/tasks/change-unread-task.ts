/* eslint no-unused-vars: 0*/
import _ from 'underscore';
import Attributes from '../attributes';
import { ChangeMailTask } from './change-mail-task';
import { localized } from '../../intl';
import { AttributeValues } from '../models/model';

export class ChangeUnreadTask extends ChangeMailTask {
  static attributes = {
    ...ChangeMailTask.attributes,

    unread: Attributes.Boolean({
      modelKey: 'unread',
    }),
  };

  unread: boolean;

  constructor(data: AttributeValues<typeof ChangeUnreadTask.attributes> = {}) {
    super(data);
  }

  label() {
    return this.unread ? localized('Marking as unread') : localized('Marking as read');
  }

  description() {
    const count = this.threadIds.length;

    if (this.isUndo) {
      return localized(`Undoing changes`);
    }

    const newState = this.unread ? localized('Unread') : localized('Read');
    if (count > 1) {
      return localized(`Marked %@ threads as %@`, count, newState.toLocaleLowerCase());
    }
    return localized(`Marked as %@`, newState.toLocaleLowerCase());
  }

  createUndoTask() {
    const task = super.createUndoTask();
    task.unread = !this.unread;
    return task;
  }
}
