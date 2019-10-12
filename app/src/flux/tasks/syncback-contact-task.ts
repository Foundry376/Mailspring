import { Task } from './task';
import Attributes from '../attributes';
import { Contact } from '../models/contact';
import { AttributeValues } from '../models/model';

export class SyncbackContactTask extends Task {
  static attributes = {
    ...Task.attributes,

    contact: Attributes.Object({
      modelKey: 'contact',
      itemClass: Contact,
    }),
  };

  contact: Contact;

  static forCreating({ contact, accountId }: { contact: Contact; accountId: string }) {
    return new SyncbackContactTask({
      contact: new Contact(Object.assign({ accountId }, contact)),
      accountId: accountId,
    });
  }

  static forUpdating({ contact }: { contact: Contact }) {
    return new SyncbackContactTask({
      contact: contact,
      accountId: contact.accountId,
    });
  }

  constructor(data: AttributeValues<typeof SyncbackContactTask.attributes> = {}) {
    super(data);
  }
}
