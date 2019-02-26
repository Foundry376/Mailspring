import ToolbarCategoryPicker from './toolbar-category-picker';
const { ComponentRegistry } = require('mailspring-exports');

export function activate() {
  ComponentRegistry.register(ToolbarCategoryPicker, { role: 'ThreadActionsToolbarButton' });
}

export function deactivate() {
  ComponentRegistry.unregister(ToolbarCategoryPicker);
}
