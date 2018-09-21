/* eslint jsx-a11y/tabindex-no-positive: 0 */
import React, { Component } from 'react';
// const chatPanelImg = require('./chatPanel@2x.png')

export default class ChatButton extends React.Component {
  static displayName = 'ChatView';

  render() {
    const { showFlag } = this.props;
    return (
      <div className="chat-view-container" style={{ display: showFlag ? 'block' : 'none' }}>
        <h2>Chat</h2>
      </div>
    )
  }
}