const ToolbarCategoryPicker = require('./toolbar-category-picker');
const { ComponentRegistry } = require('mailspring-exports');

module.exports = {
  activate() {
    // ComponentRegistry.register(ToolbarCategoryPicker, { role: 'MailActionsToolbarButton' });
  },

  deactivate() {
    // ComponentRegistry.unregister(ToolbarCategoryPicker);
  },
};
