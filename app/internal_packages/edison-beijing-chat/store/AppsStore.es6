import { iniApps, getToken } from '../chat-components/utils/appmgt';
import { AccountStore } from 'mailspring-exports';
import { ContactStore } from 'chat-exports';
import path from "path";
import { queryProfile } from '../chat-components/utils/restjs';
import { isJsonStr } from '../chat-components/utils/stringUtils';
const sqlite = require('better-sqlite3');
import MailspringStore from 'mailspring-store';

class AppsStore extends MailspringStore {
  saveMyAppsAndEmailContacts = async (payload) => {
    const token = await getToken(payload.local);
    await this.saveEmailContacts(payload, token);
    await this.saveMyApps(payload, token);
  }

  saveMyApps = async (payload, token) => {
    iniApps(payload.local, token, apps => {
      if (apps) {
        apps = apps.map(app => {
          app = Object.assign({}, app);
          app.jid = app.id + '@app.im.edison.tech';
          app.oriName = app.name;
          app.avatar = app.icon;
          app.isApp = true;
          return app;
        });
        ContactStore.saveContacts(apps, payload.curJid);
      }
    })
  }

  saveEmailContacts = async (payload, accessToken) => {
    let configDirPath = AppEnv.getConfigDirPath();
    let dbpath = path.join(configDirPath, 'edisonmail.db');
    const sqldb = sqlite(dbpath);
    const stmt = sqldb.prepare('SELECT * FROM contact where sendToCount >= 1 and recvFromCount > 1');
    let emailContacts = stmt.all();
    sqldb.close();
    const emails = emailContacts.map(contact => contact.email);
    queryProfile({ accessToken, emails }, (err, res) => {
      if (!res) {
        console.log('fail to login to queryProfile');
        return;
      }
      if (isJsonStr(res)) {
        res = JSON.parse(res);
      }
      if (!res || !res.data || !res.data.users) {
        return;
      }
      const users = res.data.users;
      const chatAccounts = AppEnv.config.get('chatAccounts') || {};
      emailContacts = emailContacts.map((contact, index) => {
        contact = Object.assign(contact, users[index]);
        if (contact.userId) {
          contact.jid = contact.userId + '@im.edison.tech'
        } else {
          contact.jid = contact.email.replace('@', '^at^') + '@im.edison.tech'
        }
        contact.curJid = this.getCurJidByAccountId(contact.accountId, chatAccounts);
        return contact;
      });
      emailContacts = emailContacts.filter(contact => !!contact.curJid);
      ContactStore.saveContacts(emailContacts, payload.curJid);
      return;
    })
  }

  getCurJidByAccountId = (aid, chatAccounts) => {
    const contact = AccountStore.accountForId(aid);
    const chatAcc = contact ? chatAccounts[contact.emailAddress] : null;
    return chatAcc ? chatAcc.userId + '@im.edison.tech' : null;
  }
}

module.exports = new AppsStore();