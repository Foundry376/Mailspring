import { Task } from './task';
import Attributes from '../attributes';
import { ContactGroup } from '../models/contact-group';
import { AttributeValues } from '../models/model';

export class SyncbackContactGroupTask extends Task {
  static attributes = {
    ...Task.attributes,

    group: Attributes.Object({
      modelKey: 'group',
      itemClass: ContactGroup,
    }),
    previousName: Attributes.String({
      modelKey: 'previousName',
    }),
  };

  group: ContactGroup;
  previousName: string;

  static forCreating(accountId: string, name: string) {
    return new SyncbackContactGroupTask({
      accountId: accountId,
      group: new ContactGroup({ name }),
    });
  }

  static forRenaming(group: ContactGroup, name: string) {
    const named = group.clone();
    named.name = name;

    return new SyncbackContactGroupTask({
      accountId: group.accountId,
      group: named,
    });
  }

  constructor(data: AttributeValues<typeof SyncbackContactGroupTask.attributes> = {}) {
    super(data);
  }

  createUndoTask() {
    return SyncbackContactGroupTask.forRenaming(this.group, this.previousName);
  }
}
