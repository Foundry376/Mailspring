const ToolbarCategoryPicker = require('./toolbar-category-picker');
const { ComponentRegistry } = require('mailspring-exports');

module.exports = {
  activate() {
    ComponentRegistry.register(ToolbarCategoryPicker, { role: 'ThreadActionsToolbarButton' });
  },

  deactivate() {
    ComponentRegistry.unregister(ToolbarCategoryPicker);
  },
};
