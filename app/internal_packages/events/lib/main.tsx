const { ComponentRegistry } = require('mailspring-exports');
const EventHeader = require('./event-header');

module.exports = {
  activate(state = {}) {
    this.state = state;
    ComponentRegistry.register(EventHeader, { role: 'message:BodyHeader' });
  },

  deactivate() {
    ComponentRegistry.unregister(EventHeader);
  },

  serialize() {
    return this.state;
  },
};
