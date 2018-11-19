import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Button from '../common/Button';
import Loader from '../common/Loader';
import { register } from '../../utils/restjs';
import keyMannager from '../../../../../src/key-manager';
import chatModel from '../../store/model';

import getDb from '../../db';

export default class HomePage extends Component {
  static propTypes = {
    isAuthenticating: PropTypes.bool.isRequired,
    submitAuth: PropTypes.func.isRequired
  }

  constructor(){
    super()
    this.state = {}
  }

  startChat = () => {
    let acc = this.selectedAccount;
    let chatAccounts = AppEnv.config.get('chatAccounts') || {};
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
          } catch(e) {
            console.log('response is not json');
          }
          if (err || !res || res.resultCode != 1) {
            this.setState({errorMessage: "This email has not a chat account，need to be registered, but failed, please try later again"});
            return;
          }
          chatAccount = res.data;
          let jid = chatAccount.userId + '@im.edison.tech/macos';
          chatModel.currentUser.jid = jid;
          this.props.submitAuth(jid, chatAccount.password, acc.emailAddress);
          chatAccount.clone = () => Object.assign({}, chatAccount);
          keyMannager.extractChatAccountSecrets(chatAccount).then(chatAccount => {
            chatAccounts[acc.emailAddress] = chatAccount;
            AppEnv.config.set('chatAccounts', chatAccounts);
            AppEnv.config.set('activeChatAccount', chatAccount);
          })
        })
      })
    } else {
      AppEnv.config.set('activeChatAccount', chatAccount);
      chatAccount.clone = () => Object.assign({}, chatAccount);
      chatAccount = keyMannager.insertChatAccountSecrets(chatAccount).then(chatAccount => {
        let jid = chatAccount.userId + '@im.edison.tech/macos';
        chatModel.currentUser.jid = jid;
        this.props.submitAuth(jid, chatAccount.password, chatAccount.email);
      });
    }
  }

  componentWillMount() {
    let accounts = AppEnv.config.get('accounts') || {};
    this.state.accounts = accounts;
    this.selectedAccount = accounts[0];
  }
  onChangeAccount = event => {
    let value = event.target.value
    this.selectedAccount = this.state.accounts[value];
  }

  render() {
    return (
      <div className="chat-container">
        {this.props.isAuthenticating ?
          <Loader /> :
          <div className="authFormContainer">
            <div className="label">email:</div>
            <select className="label" onChange={this.onChangeAccount}>
              {this.state.accounts.map( (acc, index) => <option value={index} key={acc.emailAddress}> {acc.emailAddress} </option> )}
            </select>
            <Button onTouchTap={this.startChat} className="start-chat-button">
              start chatting!
            </Button>
            {this.state.errorMessage && <div className="error-message">{this.state.errorMessage}</div>}
          </div>
        }
      </div>
    );
  }
}
