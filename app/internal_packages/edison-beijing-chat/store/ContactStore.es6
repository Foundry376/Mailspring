import MailspringStore from 'mailspring-store';
import ContactModel from '../model/Contact';
import {jidbare } from '../chat-components/utils/jid';
class ContactStore extends MailspringStore {
  constructor() {
    super();
    this.contacts = [];
  }

  refreshContacts = async () => {
    this.contacts = await ContactModel.findAll();
    this.trigger();
  }

  saveContacts = async (contacts, forCurJid) => {
    for (const contact of contacts) {
      const jid = jidbare(contact.jid);
      const curJid = contact.curJid || forCurJid || jid;
      const contactInDb = await ContactModel.findOne({
        where: { jid }
      });
      if (contactInDb) {
        ContactModel.update({
          jid,
          curJid,
          name: contact.oriName || contact.email,
          email: contact.email,
          avatar: contact.avatar ? contact.avatar : contactInDb.avatar,
          isApp: contact.isApp
        }, {
            where: { jid }
          });
      } else {
        ContactModel.create({
          jid,
          curJid,
          name: contact.oriName || contact.email,
          email: contact.email,
          avatar: contact.avatar,
          isApp: contact.isApp
        });
      }
    }
    this.refreshContacts();
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
