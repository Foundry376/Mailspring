/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
import MessagesPanel from '../components/chat/messages/MessagesPanel';

export default class ChatView extends Component {
  static displayName = 'ChatView';

  render() {
    return (
      <div className="chat-view-container">
        <MessagesPanel />
      </div>
    )
  }
}
