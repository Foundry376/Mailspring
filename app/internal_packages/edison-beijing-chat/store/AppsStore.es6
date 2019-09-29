import { iniApps, getToken } from '../utils/appmgt'
import { AccountStore } from 'mailspring-exports'
import { ConversationStore, ContactStore } from 'chat-exports'
import ContactModel from '../model/Contact'
import path from 'path'
import { queryProfile } from '../utils/restjs'
import { isJsonStr } from '../utils/stringUtils'
import MailspringStore from 'mailspring-store'
import { log } from '../utils/log'
import { jidlocal } from '../utils/jid'
const sqlite = require('better-sqlite3')

class AppsStore extends MailspringStore {
  refreshAppsEmailContacts = async () => {
    const chatAccounts = AppEnv.config.get('chatAccounts') || {}
    log('connect', 'refreshAppsEmailContacts: chatAccounts: ' + JSON.stringify(chatAccounts))
    let acc, userId
    for (const email in chatAccounts) {
      acc = chatAccounts[email]
      userId = acc.userId
      if (!userId) {
        continue
      }
      const payload = {
        local: userId,
        curJid: userId + '@im.edison.tech'
      }
      await this.saveMyAppsAndEmailContacts(payload)
    }
  }
  saveMyAppsAndEmailContacts = async payload => {
    log('contact', `saveMyAppsAndEmailContacts: ${JSON.stringify(payload)}`)
    if (typeof payload === 'string') {
      const userId = jidlocal(payload)
      payload = {
        local: userId,
        curJid: userId + '@im.edison.tech'
      }
    }
    const token = await getToken(payload.local)
    await this.saveEmailContacts(payload, token)
    await this.saveMyApps(payload, token)
  }

  saveMyApps = async (payload, token) => {
    iniApps(payload.local, token, apps => {
      if (apps) {
        apps = apps.map(app => {
          app = Object.assign({}, app)
          app.jid = app.id + '@app.im.edison.tech'
          app.oriName = app.name
          app.avatar = app.icon
          app.isApp = true
          app.email = app.jid
          return app
        })
        ContactStore.saveContacts(apps, payload.curJid)
      }
    })
  }

  saveEmailContacts = async (payload, accessToken) => {
    log('contact', `saveEmailContacts: payload: ${JSON.stringify(payload)} accessToken: ${accessToken}`)
    let configDirPath = AppEnv.getConfigDirPath()
    let dbpath = path.join(configDirPath, 'edisonmail.db')
    const sqldb = sqlite(dbpath)
    const accounts = AppEnv.config.get('accounts')
    let accoundIds = accounts.map(acc => `"${acc.id}"`)
    log('contact', `saveEmailContacts: acc.id: ` + accoundIds.join(', '))
    const sql = `SELECT * FROM contact where sendToCount >= 1 and recvFromCount >= 1 and accountId in (${accoundIds.join(
      ','
    )})`
    let stmt = sqldb.prepare(sql)
    let emailContacts = stmt.all()
    sqldb.close()
    const emails = emailContacts.map(contact => contact.email)
    log('contact', `saveEmailContacts: emails: ` + emails.join(', '))
    queryProfile({ accessToken, emails }, async (err, res) => {
      if (!res) {
        log('contact', `fail to login to queryProfile: err： ` + JSON.stringify(err))
        return
      }
      if (isJsonStr(res)) {
        res = JSON.parse(res)
      }
      if (!res || !res.data || !res.data.users) {
        return
      }
      const users = res.data.users
      let chatAccounts = AppEnv.config.get('chatAccounts') || {}
      emailContacts = emailContacts.map((contact, index) => {
        contact = Object.assign(contact, users[index])
        if (contact.userId) {
          contact.jid = contact.userId + '@im.edison.tech'
        } else {
          contact.jid = contact.email.replace('@', '^at^') + '@im.edison.tech'
        }
        contact.curJid = this.getCurJidByAccountId(contact.accountId, chatAccounts) || payload.curJid
        return contact
      })
      chatAccounts = Object.values(chatAccounts)
      chatAccounts.forEach(contact => {
        contact.jid = contact.userId + '@im.edison.tech'
        contact.curJid = contact.jid
      })
      emailContacts = emailContacts.filter(contact => !!contact.curJid)
      emailContacts = chatAccounts.concat(emailContacts)
      log('contact', `saveEmailContacts: emails 2: ` + emailContacts.map(contact => contact.email).join(', '))
      await ContactStore.saveContacts(emailContacts, payload.curJid)
    })
  }

  getCurJidByAccountId = (aid, chatAccounts) => {
    const acc = AccountStore.accountForId(aid)
    const chatAcc = acc ? chatAccounts[acc.emailAddress] : null
    return chatAcc ? chatAcc.userId + '@im.edison.tech' : null
  }
}

module.exports = new AppsStore()
