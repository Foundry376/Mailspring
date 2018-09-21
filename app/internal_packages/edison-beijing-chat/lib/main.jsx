import ChatButton from './chat-button';
const { ComponentRegistry, WorkspaceStore } = require('mailspring-exports');

module.exports = {
  activate() {
    ComponentRegistry.register(ChatButton, {
      location: WorkspaceStore.Location.RootSidebar.Toolbar,
    });
  },

  deactivate() {
    ComponentRegistry.unregister(ChatButton);
  },
};
