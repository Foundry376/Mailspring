import MailspringStore from 'mailspring-store'
import ContactModel from '../model/Contact'
import { jidbare } from '../utils/jid'
import _ from 'lodash'

class ContactStore extends MailspringStore {
  constructor () {
    super()
    this.contacts = []
  }

  refreshContacts = async () => {
    let contacts = await ContactModel.findAll({
      order: [['isApp'], ['name'], ['createdAt', 'desc']]
    })
    contacts = _.uniqBy(contacts, 'email')
    if (contacts.length !== this.contacts.length) {
      this.contacts = contacts
      this.trigger()
    } else if (contacts.some(x => !this.contacts.some(y => y.email === x.email))) {
      this.contacts = contacts
      this.trigger()
    }
  }

  saveContacts = async (contacts, forCurJid) => {
    let i = 0
    while (i < contacts.length) {
      const contact = contacts[i]
      const jid = jidbare(contact.jid)
      const curJid = contact.curJid || forCurJid || jid
      const contactInDb = await this.findContactInDBByEmail(contact.email)
      const name = contact.oriName || contact.name || contact.email
      if (contactInDb) {
        await ContactModel.update(
          {
            jid,
            curJid,
            name: contactInDb.name || name,
            email: contact.email,
            avatar: contactInDb.avatar ? contactInDb.avatar : contact.avatar,
            isApp: contact.isApp
          },
          {
            where: { email: contactInDb.email }
          }
        )
      } else {
        await ContactModel.upsert({
          jid,
          curJid,
          name,
          email: contact.email,
          avatar: contact.avatar,
          isApp: contact.isApp
        })
      }
      i++
    }
    this.refreshContacts()
  }

  findContactByEmail = async email => {
    if (this.contacts) {
      for (const contact of this.contacts) {
        if (contact.email === email) {
          return contact
        }
      }
    } else {
      this.refreshContacts()
    }
    return await ContactModel.findOne({
      where: { email },
      order: [['createdAt', 'desc']]
    })
  }
  findContactInDBByEmail = async email => {
    return await ContactModel.findOne({
      where: { email },
      order: [['createdAt', 'desc']]
    })
  }

  findContactByJid = async jid => {
    if (this.contacts) {
      for (const contact of this.contacts) {
        if (contact.jid === jid) {
          return contact
        }
      }
    } else {
      this.refreshContacts()
    }
    return await ContactModel.findOne({
      where: { jid }
    })
  }

  findOneByCondition = async where => {
    return await ContactModel.findOne({
      where
    })
  }

  getContacts = async () => {
    if (!this.contacts || !this.contacts.length) {
      await this.refreshContacts()
    }
    return this.contacts
  }
}

module.exports = new ContactStore()
