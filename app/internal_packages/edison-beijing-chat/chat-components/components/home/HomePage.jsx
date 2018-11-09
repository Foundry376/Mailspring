import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Button from '../common/Button';
import Loader from '../common/Loader';
import { register } from '../../utils/restjs';
import keyMannager from '../../../../../src/key-manager';

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
        register(acc.emailAddress, acc.settings.imap_password, acc.name, (err, res) => {
          if (err) return;
          res = JSON.parse(res);
          chatAccount = res.data;
          chatAccounts[acc.emailAddress] = chatAccount;
          AppEnv.config.set(chatAccounts, chatAccounts);
          chatAccount = chatAccounts[acc.emailAddress];
          let jid = chatAccount.userId + '@im.edison.tech/macos';
          this.props.submitAuth(jid, chatAccount.password, acc.emailAddress);
        })
      })
    } else {
      let jid = chatAccount.userId + '@im.edison.tech/macos';
      this.props.submitAuth(jid, chatAccount.password, acc.emailAddress);
    }
  }

  componentWillMount() {
    let accounts = AppEnv.config.get('accounts') || {};
    this.state.accounts = accounts;
    this.selectedAccount = accounts[0];
    debugger;
  }
  onChangeAccount = event => {
    let value = event.target.value
    console.log('onChangeAccount', value);
    this.selectedAccount = this.state.accounts[value];
  }

  render() {
    return (
      <div className="chat-container">
        {this.props.isAuthenticating ?
          <Loader /> :
          <div className="authFormContainer">
            <div className="label" style={{margin:"0 auto"}}>email:</div>
            <select className="label" onChange={this.onChangeAccount} style={{margin:"0 auto", padding:"0 5px", textAlign:"center"}}>
              {this.state.accounts.map( (acc, index) => <option value={index} key={acc.emailAddress}> {acc.emailAddress} </option> )}
            </select>
            <Button onTouchTap={this.startChat} style={{margin:"10px auto", backgroundColor:"gray", border:"solid pink 2px"}}>
              start chatting!
            </Button>
          </div>
        }
      </div>
    );
  }
}
