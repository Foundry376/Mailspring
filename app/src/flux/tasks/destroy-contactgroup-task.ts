import { Task } from './task';
import Attributes from '../attributes';
import { ContactGroup } from '../models/contact-group';
import { AttributeValues } from '../models/model';
import { SyncbackContactGroupTask } from './syncback-contactgroup-task';

export class DestroyContactGroupTask extends Task {
  static attributes = {
    ...Task.attributes,

    group: Attributes.Object({
      modelKey: 'group',
      itemClass: ContactGroup,
    }),
  };

  group: ContactGroup;

  static forRemoving(group: ContactGroup) {
    return new DestroyContactGroupTask({
      accountId: group.accountId,
      group,
    });
  }

  constructor(data: AttributeValues<typeof DestroyContactGroupTask.attributes> = {}) {
    super(data);
  }

  createUndoTask() {
    return SyncbackContactGroupTask.forCreating(this.group.accountId, this.group.name);
  }
}
