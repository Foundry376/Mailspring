
const React = require("react");
const AccountSidebar = require("./components/account-sidebar");
const {ComponentRegistry, WorkspaceStore} = require("mailspring-exports");

module.exports = {
  item: null, // The DOM item the main React component renders into

  activate(state) {
    this.state = state;
    ComponentRegistry.register(AccountSidebar,
      {location: WorkspaceStore.Location.RootSidebar});
  },

  deactivate(state) {
    this.state = state;
    ComponentRegistry.unregister(AccountSidebar);
  }
};
