import keyMannager from '../../../src/key-manager';
import { register } from './restjs';
import { SUBMIT_AUTH } from '../chat-components/actions/auth';
import { OnlineUserStore } from 'chat-exports';

export default async function registerLoginChatAccounts() {
  let accounts = AppEnv.config.get('accounts');

  for (let account of accounts) {
    await registerLoginEmailAccountForChat(account);
  }
}

export async function registerLoginEmailAccountForChat(account) {
  const chatAccounts = AppEnv.config.get('chatAccounts') || {};
   let chatAccount = chatAccounts[account.emailAddress] || {};

  // get chat password from cache
  if (chatAccount.userId) {
    let jid = chatAccount.userId + '@im.edison.tech';
    chatAccount = OnlineUserStore.getSelfAccountById(jid) || chatAccount;
  }
  // get chat password from keychain
  chatAccount.clone = () => Object.assign({}, chatAccount);
  chatAccount = await keyMannager.insertChatAccountSecrets(chatAccount);

  let passedTime = ((new Date()).getTime() - chatAccount.refreshTime || 0) / 1000;// seconds
  const leftTime = chatAccount.expiresIn - passedTime;

  if (!chatAccount.password || (leftTime < 2 * 24 * 3600)) {
    account.clone = () => Object.assign({}, account);
    account = await keyMannager.insertAccountSecrets(account);
    console.log("registerLoginChatAccounts account.settings.refresh_token, account.settings.imap_password, account: ", account.settings.refresh_token, account.settings.imap_password, account);
    if (account.settings && !account.settings.imap_password && !account.settings.refresh_token) {
      console.error('email account passwords in keychain lost! ', account);
      return;
    }
    let type;
    if (account.settings.refresh_token) {
      type = 1
    } else {
      type = 0
    }
    let { err, res } = await register(account.emailAddress, account.settings.refresh_token || account.settings.imap_password, account.name, type, account.provider, account.settings);
    try {
      res = JSON.parse(res);
    } catch (e) {
      console.error('email account fail to register chat: response is not json. response:' + res);
      return;
    }
    if (err || !res || res.resultCode !== 1) {
      console.error('email account fail to register chat: ', account, err, res);
      return;
    }
    chatAccount = res.data;
    chatAccount.refreshTime = (new Date()).getTime();
    let jid = chatAccount.userId + '@im.edison.tech';
    OnlineUserStore.addSelfAccount(jid, chatAccount);
    chatReduxStore.dispatch({
      type: SUBMIT_AUTH,
      payload: { jid, password: chatAccount.password, email: account.emailAddress }
    });
    chatAccount.clone = () => Object.assign({}, chatAccount);
    keyMannager.extractChatAccountSecrets(chatAccount).then(chatAccount => {
      chatAccounts[account.emailAddress] = chatAccount;
      AppEnv.config.set('chatAccounts', chatAccounts);
    })
  } else {
    let jid = chatAccount.userId + '@im.edison.tech';
    OnlineUserStore.addSelfAccount(jid, chatAccount);
    chatReduxStore.dispatch({
      type: SUBMIT_AUTH,
      payload: { jid, password: chatAccount.password, email: chatAccount.email }
    });
  }
 }
