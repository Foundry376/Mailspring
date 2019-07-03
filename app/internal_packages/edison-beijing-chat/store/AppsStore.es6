import { iniApps, getToken } from '../utils/appmgt';
import { AccountStore } from 'mailspring-exports';
import { ConversationStore, ContactStore } from 'chat-exports';
import path from "path";
import { queryProfile } from '../utils/restjs';
import { isJsonStr } from '../utils/stringUtils';
const sqlite = require('better-sqlite3');
import MailspringStore from 'mailspring-store';
import { NEW_CONVERSATION } from './ConversationStore';

class AppsStore extends MailspringStore {
  refreshAppsEmailContacts = async () => {
    const chatAccounts = AppEnv.config.get('chatAccounts') || {};
    let acc, userId;
    for (const email in chatAccounts) {
      acc = chatAccounts[email];
      userId = acc.userId;
      break;
    }
    if (!userId) {
      return;
    }
    const payload = {
      local: userId,
      curJid: userId + '@im.edison.tech'
    }
    await this.saveMyAppsAndEmailContacts(payload);
  }
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
          app.email = app.jid;
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
    let stmt = sqldb.prepare('SELECT * FROM contact where sendToCount >= 1 and recvFromCount >= 1');
    let emailContacts = stmt.all();
    sqldb.close();
    const emails = emailContacts.map(contact => contact.email);
    queryProfile({ accessToken, emails }, async (err, res) => {
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
        contact.curJid = payload.curJid;
        return contact;
      });
      emailContacts = emailContacts.filter(contact => !!contact.curJid);
      await ContactStore.saveContacts(emailContacts, payload.curJid);
      return;
    })
  }
}

module.exports = new AppsStore();
