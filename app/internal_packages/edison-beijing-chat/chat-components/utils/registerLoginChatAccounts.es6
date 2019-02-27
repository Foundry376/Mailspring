import keyMannager from '../../../../src/key-manager';
import { register } from './restjs';
import chatModel, { loadFromLocalStorage } from '../store/model';
import { SUBMIT_AUTH } from '../actions/auth';

export default async function registerLoginChatAccounts() {
  loadFromLocalStorage();
  let accounts = AppEnv.config.get('accounts')
  let chatAccounts = AppEnv.config.get('chatAccounts') || {};
  for (let acc of accounts) {
    let chatAccount = chatAccounts[acc.emailAddress];
    let leftTime = 0;
    if (chatAccount) {
      acc.email = acc.emailAddress;
      let passedTime = ((new Date()).getTime() - chatAccount.refreshTime || 0) / 1000;// seconds
      leftTime = chatAccount.expiresIn - passedTime;
    }

    chatAccount.clone = () => Object.assign({}, chatAccount);
    // get chat password from cache
    if (chatAccount && chatAccount.userId) {
      let jid = chatAccount.userId + '@im.edison.tech';
      chatAccount = chatModel.allSelfUsers[jid];
    }
    // get chat password from keychain
    else {
      chatAccount = await keyMannager.insertChatAccountSecrets(chatAccount);
    }

    if (!chatAccount || !chatAccount.password || (leftTime < 2 * 24 * 3600)) {
      acc.clone = () => Object.assign({}, acc);
      acc = await keyMannager.insertAccountSecrets(acc);
      if (acc.settings && !acc.settings.imap_password && !acc.settings.refresh_token) {
        console.error('email account passwords in keychain lost! ', acc);
        continue;
      }
      let email = acc.emailAddress;
      let type = 0;
      if (email.includes('gmail.com') || email.includes('edison.tech') || email.includes('mail.ru') || acc.provider === 'gmail') {
        type = 1;
      }
      //register = (email, pwd, name, type, provider, setting, cb) => {
      let { err, res } = await register(acc.emailAddress, acc.settings.imap_password || acc.settings.refresh_token, acc.name, type, acc.provider, acc.settings);
      try {
        res = JSON.parse(res);
      } catch (e) {
        console.error('email account fail to register chat: response is not json');
        continue;
      }
      if (err || !res || res.resultCode != 1) {
        console.error('email account fail to register chat: ', acc, err, res);
        continue;
      }
      chatAccount = res.data;
      chatAccount.refreshTime = (new Date()).getTime();
      let jid = chatAccount.userId + '@im.edison.tech';
      chatModel.allSelfUsers[jid] = chatAccount;
      chatModel.store.dispatch({
        type: SUBMIT_AUTH,
        payload: { jid, password: chatAccount.password, email: acc.emailAddress }
      });
      chatAccount.clone = () => Object.assign({}, chatAccount);
      keyMannager.extractChatAccountSecrets(chatAccount).then(chatAccount => {
        chatAccounts[acc.emailAddress] = chatAccount;
        AppEnv.config.set('chatAccounts', chatAccounts);
      })
    } else {
      let jid = chatAccount.userId + '@im.edison.tech';
      chatModel.allSelfUsers[jid] = chatAccount;
      chatModel.store.dispatch({
        type: SUBMIT_AUTH,
        payload: { jid, password: chatAccount.password, email: chatAccount.email }
      });
    }
  };
}
