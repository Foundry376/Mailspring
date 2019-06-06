import MailspringStore from 'mailspring-store';
import ContactModel from '../model/Contact';
class ContactStore extends MailspringStore {
  constructor() {
    super();
    this.contacts = [];
  }

  refreshContacts = async () => {
    this.contacts = await ContactModel.findAll();
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
      for (const contact of this.contacts) {
        if (contact.jid === jid) {
          return contact;
        }
      }
    } else {
      this.refreshContacts();
    }
    return await ContactModel.findOne({
      where: { jid }
    });
  }

  findOneByCondition = async (where) => {
    return await ContactModel.findOne({
      where
    });
  }

  getContacts = async () => {
    if (!this.contacts) {
      await this.refreshContacts();
    }
    return this.contacts;
  }
}

module.exports = new ContactStore();
