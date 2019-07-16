import MailspringStore from 'mailspring-store';
import E2eeModel from '../model/E2ee';
import xmpp from '../xmpp';

class E2eeStore extends MailspringStore {
  constructor() {
    super();
    this.e2ees = null;
  }

  refreshE2ees = async () => {
    this.e2ees = {};
    const data = await E2eeModel.findAll();
    for (const item of data) {
      item.devices = JSON.parse(item.devices);
      this.e2ees[item.jid] = item;
    }
    this.trigger();
  }

  saveE2ees = (e2ees) => {
    if (!e2ees || !e2ees.e2ee) { return; }
    let { e2ee: { users } } = e2ees;
    if (users) {
      for (const user of users) {
        E2eeModel.upsert({ jid: user.jid, devices: JSON.stringify(user.devices) });
      }
      this.refreshE2ees();
    }
  }
  saveE2ee = async (user) => {
    if (!user) { return; }
    await E2eeModel.upsert({ jid: user.jid, devices: JSON.stringify(user.devices) });
    this.refreshE2ees();
  }
  getE2ees = async () => {
    if (!this.e2ees) {
      await this.refreshE2ees();
    }
    return this.e2ees;
  }
  find = async (jids, curJid) => {
    if (!this.e2ees) {
      await this.refreshE2ees();
    }
    let items = [];
    if (jids) {
      let users = [];
      for (const jid of jids) {
        let item = this.e2ees[jid];
        if (item) {
          items.push(item);
        } else {
          users.push(jid)
        }
      }
      if (users.length > 0 && curJid) {
        const result = await xmpp.getE2ee(users, curJid);
        if (result && result.e2ee && result.e2ee.users) {
          result.e2ee.users.forEach(element => {
            items.push(element)
          });
          this.saveE2ees(result)
        }
      }
    }
    return items;
  }
  findOne = async (jid, curJid) => {
    if (!this.e2ees) {
      await this.refreshE2ees();
    }
    let e2ee = this.e2ees[jid];
    if (!e2ee && curJid) {
      const result = await xmpp.getE2ee([jid], curJid);
      if (result && result.e2ee && result.e2ee.users) {
        e2ee = result.e2ee.users[0];
        this.saveE2ees(result)
      }
    }
    return e2ee;
  }
}

module.exports = new E2eeStore();
