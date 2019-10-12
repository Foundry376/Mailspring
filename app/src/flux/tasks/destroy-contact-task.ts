import { Task } from './task';
import Attributes from '../attributes';
import { Contact } from '../models/contact';
import { AttributeValues } from '../models/model';
import { localized } from 'mailspring-exports';

export class DestroyContactTask extends Task {
  static attributes = {
    ...Task.attributes,

    contacts: Attributes.Collection({
      modelKey: 'contacts',
      itemClass: Contact,
    }),
  };

  contacts: Contact[];

  static forRemoving({ contacts }: { contacts: Contact[] }) {
    return new DestroyContactTask({
      contacts: contacts,
      accountId: contacts[0].accountId,
    });
  }

  constructor(data: AttributeValues<typeof DestroyContactTask.attributes> = {}) {
    super(data);
  }

  description() {
    return localized(`Removed %@ contacts`, this.contacts.length);
  }
}
