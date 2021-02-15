/* eslint no-unused-vars: 0*/
import _ from 'underscore';
import * as Attributes from '../attributes';
import { ChangeMailTask } from './change-mail-task';
import { localized } from '../../intl';
import { AttributeValues } from '../models/model';
import { Thread } from '../models/thread';
import { Message } from '../models/message';

export class ChangeStarredTask extends ChangeMailTask {
  static attributes = {
    ...ChangeMailTask.attributes,

    starred: Attributes.Boolean({
      modelKey: 'starred',
    }),
  };

  starred: boolean;

  constructor(
    data: AttributeValues<typeof ChangeStarredTask.attributes> & {
      threads?: Thread[];
      messages?: Message[];
    } = {}
  ) {
    super(data);
  }

  label() {
    return this.starred ? localized('Starring') : localized('Unstarring');
  }

  description() {
    const count = this.threadIds.length;

    if (this.isUndo) {
      return localized(`Undoing changes`);
    }

    if (count > 1) {
      this.starred
        ? localized('Starred %@ threads', count)
        : localized('Unstarred %@ threads', count);
    }
    return this.starred ? localized('Starred') : localized('Unstarred');
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
