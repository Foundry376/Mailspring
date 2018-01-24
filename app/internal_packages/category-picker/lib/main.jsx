const MovePicker = require('./move-picker');
const LabelPicker = require('./label-picker');

const { ComponentRegistry } = require('mailspring-exports');

module.exports = {
  activate(state) {
    if (state == null) {
      state = {};
    }
    this.state = state;
    ComponentRegistry.register(MovePicker, { role: 'ThreadActionsToolbarButton' });
    ComponentRegistry.register(LabelPicker, { role: 'ThreadActionsToolbarButton' });
  },

  deactivate() {
    ComponentRegistry.unregister(MovePicker);
    ComponentRegistry.unregister(LabelPicker);
  },
};
