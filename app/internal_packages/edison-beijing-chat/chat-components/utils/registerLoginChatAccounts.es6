import keyMannager from '../../../../src/key-manager';
import { register } from './restjs';
import chatModel, { loadFromLocalStorage } from '../store/model';
import { SUBMIT_AUTH } from '../actions/auth';
import { getToken, iniApps } from './appmgt';

export default async function registerLoginChatAccounts() {
  loadFromLocalStorage();
  let accounts = AppEnv.config.get('accounts');
  let chatAccounts = AppEnv.config.get('chatAccounts') || {};
  for (let acc of accounts) {
    let chatAccount = chatAccounts[acc.emailAddress] || {};

    // get chat password from cache
    if (chatAccount.userId) {
      let jid = chatAccount.userId + '@im.edison.tech';
      chatAccount = chatModel.allSelfUsers[jid] || chatAccount;
    }
    // get chat password from keychain
    chatAccount.clone = () => Object.assign({}, chatAccount);
    chatAccount = await keyMannager.insertChatAccountSecrets(chatAccount);

    let leftTime = 0;
    let passedTime = ((new Date()).getTime() - chatAccount.refreshTime || 0) / 1000;// seconds
    leftTime = chatAccount.expiresIn - passedTime;

    if (!chatAccount.password || (leftTime < 2 * 24 * 3600)) {
      acc.clone = () => Object.assign({}, acc);
      acc = await keyMannager.insertAccountSecrets(acc);
      console.log("registerLoginChatAccounts acc.settings.refresh_token, acc.settings.imap_password, acc: ", acc.settings.refresh_token, acc.settings.imap_password, acc);
      if (acc.settings && !acc.settings.imap_password && !acc.settings.refresh_token) {
        console.error('email account passwords in keychain lost! ', acc);
        continue;
      }
      let email = acc.emailAddress;
      let type;
      if (acc.settings.refresh_token) {
        type = 1
      } else {
        type = 0
      }
      let { err, res } = await register(acc.emailAddress, acc.settings.refresh_token || acc.settings.imap_password, acc.name, type, acc.provider, acc.settings);
      console.log('after await register acc, type, acc.provider acc, type, acc.provider, err, res: ', acc, type, acc.provider, err, res);
      try {
        res = JSON.parse(res);
      } catch (e) {
        console.error('email account fail to register chat: response is not json. response:' + res);
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
      const userId = chatAccount.userId;
      chatModel.allSelfUsers[jid] = chatAccount;
      chatModel.store.dispatch({
        type: SUBMIT_AUTH,
        payload: { jid, password: chatAccount.password, email: chatAccount.email }
      });
    }
  };
}
