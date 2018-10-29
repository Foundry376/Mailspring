import React, { Component } from 'react';
import ChatButton from './chat-button';
import ChatView from './chat-view';
const { ComponentRegistry, WorkspaceStore } = require('mailspring-exports');

class ChatViewWithProps extends Component {
  static displayName = 'ChatViewWithProps';
  render() {
    return (
      <ChatView showFlag={true} />
    )
  }
}

module.exports = {
  activate() {
    if (AppEnv.isMainWindow()) {
      ComponentRegistry.register(ChatButton, {
        location: WorkspaceStore.Location.RootSidebar.Toolbar,
      });
    } else {
      AppEnv.getCurrentWindow().setMinimumSize(800, 600);
      ComponentRegistry.register(ChatViewWithProps, {
        location: WorkspaceStore.Location.Center,
      });
    }
  },

  deactivate() {
    ComponentRegistry.unregister(ChatButton);
  },
};
