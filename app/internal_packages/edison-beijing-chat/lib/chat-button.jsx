/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import ChatView from './chat-view'
import { RetinaImg } from 'mailspring-component-kit';
import { submitAuth } from '../chat-components/actions/auth';
const { configureStore } = require('../chat-components/store/configureStore').default;
const store = configureStore();

export default class ChatButton extends React.Component {
  static displayName = 'ChatButton';

  constructor(props) {
    super(props);
    this.state = {
      showFlag: false
    }
  }

  toggleChatPanel = () => {
    const identity = AppEnv.config.get('identity');
    const chatAccounts = AppEnv.config.get('chatAccounts');
    const activeChatAccount = chatAccounts[identity.emailAddress];
    let jid = activeChatAccount.userId + '@im.edison.tech/macos';
    store.dispatch(submitAuth(jid, activeChatAccount.password));
    this.setState({
      showFlag: !this.state.showFlag
    });
  }
  render() {
    const { showFlag } = this.state;
    return (
      <div className="toolbar-chat">
        <button className="btn btn-toolbar" onClick={this.toggleChatPanel}>
          <RetinaImg name="toolbar-chat.png" mode={RetinaImg.Mode.ContentIsMask} />
        </button>
        <ChatView showFlag={showFlag} />
      </div>
    )
  }
}
