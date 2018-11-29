import React, { Component } from 'react';
import ChatButton from './chat-button';
import ChatView from './chat-view';
const { ComponentRegistry, WorkspaceStore } = require('mailspring-exports');

module.exports = {
  activate() {
    WorkspaceStore.defineSheet('ChatView', { root: true }, { list: ['RootSidebar', 'ChatView'] });
    ComponentRegistry.register(ChatView, { location: WorkspaceStore.Location.ChatView });
    if (AppEnv.isMainWindow()) {
      ComponentRegistry.register(ChatButton, {
        location: WorkspaceStore.Location.RootSidebar.Toolbar,
      });
    } else {
      AppEnv.getCurrentWindow().setMinimumSize(800, 600);
      ComponentRegistry.register(ChatView, {
        location: WorkspaceStore.Location.Center,
      });
    }
  },

  deactivate() {
    ComponentRegistry.unregister(ChatButton);
  },
};
