/* eslint no-unused-vars: 0*/
import _ from 'underscore';
import Thread from '../models/thread';
import Actions from '../actions';
import Attributes from '../attributes';
import DatabaseStore from '../stores/database-store';
import ChangeMailTask from './change-mail-task';
import { localized } from '../../intl';

export default class ChangeUnreadTask extends ChangeMailTask {
  static attributes = Object.assign({}, ChangeMailTask.attributes, {
    unread: Attributes.Boolean({
      modelKey: 'unread',
    }),
  });

  label() {
    return this.unread ? localized('Marking as unread') : localized('Marking as read');
  }

  description() {
    const count = this.threadIds.length;

    if (this.isUndo) {
      return localized(`Undoing changes`);
    }

    const newState = this.unread ? localized('unread') : localized('read');
    if (count > 1) {
      return localized(`Marked %@ threads as %@`, count, newState);
    }
    return localized(`Marked as %@`, newState);
  }

  createUndoTask() {
    const task = super.createUndoTask();
    task.unread = !this.unread;
    return task;
  }
}
