import { Observable } from 'rxjs/Observable';
import { SUCCESS_AUTH } from '../actions/auth';
import { iniApps, getToken, getMyApps } from '../utils/appmgt';
import { AccountStore } from 'mailspring-exports';
import { ContactStore } from 'chat-exports';
import path from "path";
import { queryProfile, refreshChatAccountTokens } from '../utils/restjs';
import keyMannager from '../../../../src/key-manager';
import { isJsonStr } from '../utils/stringUtils';
const sqlite = require('better-sqlite3');

export const triggerFetchAppsEpic = action$ =>
  action$.ofType(SUCCESS_AUTH)
    .mergeMap(({ payload }) => {
      return Observable.fromPromise(saveMyAppsAndEmailContacts(payload));
    });

async function saveMyAppsAndEmailContacts(payload) {
  const token = await getToken(payload.local);
  await saveEmailContacts(payload, token);
  await saveMyApps(payload, token);
  return { type: "SUCCESS_FETCH_APPS" };
}

function saveMyApps(payload, token) {
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

async function saveEmailContacts(payload, accessToken) {
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
      contact.curJid = getCurJidByAccountId(contact.accountId, chatAccounts);
      return contact;
    });
    emailContacts = emailContacts.filter(contact => !!contact.curJid);
    ContactStore.saveContacts(emailContacts, payload.curJid);
    return;
  })
}

function getCurJidByAccountId(aid, chatAccounts) {
  const contact = AccountStore.accountForId(aid);
  const chatAcc = contact ? chatAccounts[contact.emailAddress] : null;
  return chatAcc ? chatAcc.userId + '@im.edison.tech' : null;
}
