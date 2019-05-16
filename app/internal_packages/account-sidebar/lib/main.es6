const AccountSidebar = require('./components/account-sidebar');
const { ComponentRegistry, WorkspaceStore } = require('mailspring-exports');
const { ToolbarBack } = require('mailspring-component-kit');

module.exports = {
  item: null, // The DOM item the main React component renders into

  activate(state) {
    this.state = state;
    ComponentRegistry.register(AccountSidebar, { location: WorkspaceStore.Location.RootSidebar });
    ComponentRegistry.register(ToolbarBack, {
      mode: 'list',
      role: 'MessageListToolbar'
    });
  },

  deactivate(state) {
    this.state = state;
    ComponentRegistry.unregister(AccountSidebar);
    ComponentRegistry.unregister(ToolbarBack);
  },
};
