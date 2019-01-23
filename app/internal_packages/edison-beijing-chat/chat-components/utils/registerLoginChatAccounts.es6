import keyMannager from '../../../../src/key-manager';
import { register } from './restjs';
import chatModel from '../store/model';
import { SUBMIT_AUTH } from '../actions/auth';

export default function registerLoginChatAccounts() {
  let accounts = AppEnv.config.get('accounts')
  let chatAccounts = AppEnv.config.get('chatAccounts') || {};
  for (let acc of accounts) {
    let chatAccount = chatAccounts[acc.emailAddress];
    if (!chatAccount) {
      acc.clone = () => Object.assign({}, acc);
      keyMannager.insertAccountSecrets(acc).then(acc => {
        let email = acc.emailAddress;
        let type = 0;
        if (email.includes('gmail.com') || email.includes('edison.tech') || email.includes('mail.ru') || acc.provider === 'gmail') {
          type = 1;
        }
        //register = (email, pwd, name, type, provider, setting, cb) => {
        register(acc.emailAddress, acc.settings.imap_password || acc.settings.refresh_token, acc.name, type, acc.provider, acc.settings, (err, res) => {
          try {
            res = JSON.parse(res);
          } catch (e) {
            console.log('response is not json');
          }
          if (err || !res || res.resultCode != 1) {
            // this.setState({ errorMessage: "This email has not a chat account，need to be registered, but failed, please try later again" });
            return;
          }
          chatAccount = res.data;
          let jid = chatAccount.userId + '@im.edison.tech';
          chatModel.currentUser.jid = jid;
          chatModel.currentUser.email = acc.emailAddress;
          chatModel.currentUser.password = chatAccount.password;
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
        })
      })
    } else {
      chatAccount.clone = () => Object.assign({}, chatAccount);
      chatAccount = keyMannager.insertChatAccountSecrets(chatAccount).then(chatAccount => {
        let jid = chatAccount.userId + '@im.edison.tech';
        chatModel.currentUser.jid = jid;
        chatModel.currentUser.password = chatAccount.password;
        chatModel.currentUser.email = chatAccount.email;
        chatModel.allSelfUsers[jid] = chatAccount;
        chatModel.store.dispatch({
          type: SUBMIT_AUTH,
          payload: { jid, password: chatAccount.password, email: chatAccount.email }
        });
      });
    }
  }
}
