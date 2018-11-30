import ChatButton from './chat-button';
import ChatView from './chat-view';
import ChatViewLeft from './chat-view-left';
const { ComponentRegistry, WorkspaceStore } = require('mailspring-exports');
import injectTapEventPlugin from 'react-tap-event-plugin';
injectTapEventPlugin();

module.exports = {
  activate() {
    WorkspaceStore.defineSheet('ChatView', { root: true }, { list: ['RootSidebar', 'ChatView'] });
    ComponentRegistry.register(ChatView, { location: WorkspaceStore.Location.ChatView });
    if (AppEnv.isMainWindow()) {
      ComponentRegistry.register(ChatButton, {
        location: WorkspaceStore.Location.RootSidebar.Toolbar,
      });
      ComponentRegistry.register(ChatViewLeft, {
        location: WorkspaceStore.Location.RootSidebar,
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
