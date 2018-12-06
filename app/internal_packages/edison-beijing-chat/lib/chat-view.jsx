/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import Root from '../chat-components/containers/Root';
import chatModel from '../chat-components/store/model';
import keyMannager from '../../../src/key-manager';
import { register } from '../chat-components/utils/restjs';
import { SUBMIT_AUTH } from '../chat-components/actions/auth';

const { configureStore, history } = require('../chat-components/store/configureStore').default;

export default class ChatView extends React.Component {
  static displayName = 'ChatView';

  componentWillMount() {
    let accounts = AppEnv.config.get('accounts')
    let chatAccounts = AppEnv.config.get('chatAccounts') || {};
    for (let acc of accounts) {
      let chatAccount = chatAccounts[acc.emailAddress];
      if (!chatAccount) {
        acc.clone = () => Object.assign({}, acc);
        keyMannager.insertAccountSecrets(acc).then(acc => {
          let email = acc.emailAddress;
          let type = 0;
          if (email.includes('gmail.com') || email.includes('mail.ru')) {
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
              this.setState({ errorMessage: "This email has not a chat account，need to be registered, but failed, please try later again" });
              return;
            }
            chatAccount = res.data;
            let jid = chatAccount.userId + '@im.edison.tech';
            chatModel.currentUser.jid = jid;
            chatModel.store.dispatch({type:SUBMIT_AUTH, payload:{jid, password:chatAccount.password, email:acc.emailAddress}});
            chatAccount.clone = () => Object.assign({}, chatAccount);
            keyMannager.extractChatAccountSecrets(chatAccount).then(chatAccount => {
              chatAccounts[acc.emailAddress] = chatAccount;
              AppEnv.config.set('chatAccounts', chatAccounts);
              //AppEnv.config.set('activeChatAccount', chatAccount);
            })
          })
        })
      } else {
        chatAccount.clone = () => Object.assign({}, chatAccount);
        chatAccount = keyMannager.insertChatAccountSecrets(chatAccount).then(chatAccount => {
          let jid = chatAccount.userId + '@im.edison.tech';
          chatModel.currentUser.jid = jid;
          chatModel.store.dispatch({type:SUBMIT_AUTH, payload:{jid, password:chatAccount.password, email:chatAccount.email}});
        });
      }
    }
  }

  render() {
    return (
      <div className="chat-view-container">
        <Root store={chatModel.store} history={history} />
      </div>
    )
  }
}
