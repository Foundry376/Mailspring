import { Task } from './task';
import Attributes from '../attributes';
import { Contact } from '../models/contact';
import { ContactGroup } from '../models/contact-group';
import { AttributeValues } from '../models/model';
import { localized } from 'mailspring-exports';

export class ChangeContactGroupMembershipTask extends Task {
  static attributes = {
    ...Task.attributes,

    group: Attributes.Object({
      modelKey: 'group',
      itemClasss: ContactGroup,
    }),
    contacts: Attributes.Collection({
      modelKey: 'contacts',
      itemClass: Contact,
    }),
    direction: Attributes.String({
      modelKey: 'direction',
    }),
  };

  contacts: Contact[];
  group: ContactGroup;
  direction: 'add' | 'remove';

  static forMoving({
    contacts,
    group,
    direction,
  }: {
    contacts: Contact[];
    group: ContactGroup;
    direction: 'add' | 'remove';
  }) {
    const accountId = contacts ? contacts[0].accountId : undefined;
    if (contacts.some(c => c.accountId !== accountId)) {
      throw new Error('ChangeContactGroupMembershipTask: all contacts must be in the same account');
    }
    if (group.accountId !== accountId) {
      throw new Error('ChangeContactGroupMembershipTask: group must be in the same account');
    }
    return new ChangeContactGroupMembershipTask({
      accountId,
      contacts,
      group,
      direction,
    });
  }

  constructor(data: AttributeValues<typeof ChangeContactGroupMembershipTask.attributes> = {}) {
    super(data);
  }

  description() {
    return this.direction === 'add'
      ? localized(`Added %@ to %@`, this.contacts.length, this.group.name)
      : localized(`Removed %@ from %@`, this.contacts.length, this.group.name);
  }

  createUndoTask() {
    return ChangeContactGroupMembershipTask.forMoving({
      direction: this.direction === 'remove' ? 'add' : 'remove',
      contacts: this.contacts,
      group: this.group,
    });
  }
}
