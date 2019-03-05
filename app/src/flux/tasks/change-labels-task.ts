import { Label } from '../models/label';
import { ChangeMailTask } from './change-mail-task';
import Attributes from '../attributes';
import { localized } from '../../intl';

// Public: Create a new task to apply labels to a message or thread.
//
// Takes an options object of the form:
// - labelsToAdd: An {Array} of {Category}s or {Category} ids to add
// - labelsToRemove: An {Array} of {Category}s or {Category} ids to remove
// - threads: An {Array} of {Thread}s or {Thread} ids
// - messages: An {Array} of {Message}s or {Message} ids
//
export class ChangeLabelsTask extends ChangeMailTask {
  static attributes = Object.assign({}, ChangeMailTask.attributes, {
    labelsToAdd: Attributes.Collection({
      modelKey: 'labelsToAdd',
      itemClass: Label,
    }),
    labelsToRemove: Attributes.Collection({
      modelKey: 'labelsToRemove',
      itemClass: Label,
    }),
  });

  labelsToAdd: Label[];
  labelsToRemove: Label[];

  label() {
    return localized('Applying labels');
  }

  description() {
    if (this.taskDescription) {
      return this.taskDescription;
    }

    const withCount = str => {
      if (this.threadIds.length > 1) {
        return str.replace('%@', `${this.threadIds.length} ${localized('threads')}`);
      }
      return str.replace('%@ ', '').replace(' %@', '');
    };

    const removed = this.labelsToRemove[0];
    const added = this.labelsToAdd[0];

    // Spam / trash interactions are always "moves" because they're the three
    // folders of Gmail. If another folder is involved, we need to decide to
    // return either "Moved to Bla" or "Added Bla".
    if (added && added.name === 'spam') {
      return withCount(localized(`Marked %@ as Spam`));
    } else if (removed && removed.name === 'spam') {
      return withCount(localized(`Unmarked %@ as Spam`));
    } else if (added && added.name === 'trash') {
      return withCount(localized(`Trashed %@`));
    } else if (removed && removed.name === 'trash') {
      return withCount(localized(`Removed %@ from Trash`));
    }
    if (this.labelsToAdd.length === 0 && this.labelsToRemove.find(l => l.role === 'inbox')) {
      return withCount(localized(`Archived %@`));
    } else if (this.labelsToRemove.length === 0 && this.labelsToAdd.find(l => l.role === 'inbox')) {
      return withCount(localized(`Unarchived %@`));
    }
    if (this.labelsToAdd.length === 1 && this.labelsToRemove.length === 0) {
      return this.threadIds.length > 1
        ? localized(`Added %@ to %@ threads`, added.displayName, this.threadIds.length)
        : localized(`Added %@`, added.displayName);
    }
    if (this.labelsToAdd.length === 0 && this.labelsToRemove.length === 1) {
      return this.threadIds.length > 1
        ? localized(`Removed %@ from %@ threads`, removed.displayName, this.threadIds.length)
        : localized(`Removed %@`, removed.displayName);
    }
    return this.threadIds.length > 1
      ? localized(`Changed labels on %@ threads`, this.threadIds.length)
      : localized(`Changed labels`);
  }

  _isArchive() {
    const toAdd = this.labelsToAdd.map(l => l.name);
    return toAdd.includes('all') || toAdd.includes('archive');
  }

  willBeQueued() {
    if (this.messageIds.length) {
      throw new Error('ChangeLabelsTask: Changing individual message labels is unsupported');
    }
    if (!this.labelsToAdd) {
      throw new Error(`Assertion Failure: ChangeLabelsTask requires labelsToAdd`);
    }
    if (!this.labelsToRemove) {
      throw new Error(`Assertion Failure: ChangeLabelsTask requires labelsToRemove`);
    }
    for (const l of [].concat(this.labelsToAdd, this.labelsToRemove)) {
      if (l instanceof Label === false) {
        throw new Error(
          `Assertion Failure: ChangeLabelsTask received a non-label: ${JSON.stringify(l)}`
        );
      }
    }
    super.willBeQueued();
  }

  createUndoTask() {
    const task = super.createUndoTask();
    const { labelsToAdd, labelsToRemove } = task;
    task.labelsToAdd = labelsToRemove;
    task.labelsToRemove = labelsToAdd;
    return task;
  }
}
