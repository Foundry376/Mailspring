import MailspringStore from 'mailspring-store';
import { ChatActions } from 'chat-exports';
import ContactModel from '../model/Contact';

class RoomStore extends MailspringStore {
  constructor() {
    super();
    this.contacts = null;
  }

  refreshContacts = async () => {
    this.contacts = {};
    const data = await ContactModel.findAll();
    for (const item of data) {
      this.contacts[item.jid] = item;
    }
    this.trigger();
  }

  saveContacts = async (contacts, curJid) => {
    if (contacts && contacts.roster && contacts.roster.items) {
      for (const contact of contacts.roster.items) {
        const contactInDb = await ContactModel.findOne({
          where: { jid: contact.jid.bare }
        });
        if (contactInDb) {
          ContactModel.update({
            jid: contact.jid.bare,
            curJid,
            name: contact.oriName,
            email: contact.email,
            avatar: contact.avatar ? contact.avatar : contactInDb.avatar
          }, {
              where: { jid: contact.jid.bare }
            });
        } else {
          ContactModel.create({
            jid: contact.jid.bare,
            curJid,
            name: contact.oriName,
            email: contact.email,
            avatar: contact.avatar
          });
        }
      }
      this.refreshContacts();
    }
  }

  findContactByJid = async (jid) => {
    if (this.contacts) {
      const contact = this.contacts[jid];
      if (contact) {
        return contact;
      }
    } else {
      this.refreshContacts();
    }
    return await ContactModel.findOne({
      where: { jid }
    });
  }

  getContacts = async () => {
    if (!this.contacts) {
      await this.refreshContacts();
    }
    return this.contacts;
  }
}

module.exports = new RoomStore();
