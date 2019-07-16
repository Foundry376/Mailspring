/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import ChatPage from '../chat-components/components/chat/ChatPage';

export default class ChatView extends Component {
  static displayName = 'ChatView';

  render() {
    return (
      <div className="chat-view-container">
        <ChatPage/>
      </div>
    )
  }
}
