import ChatButton from './chat-button';
import ChatView from './chat-view';
import ChatViewLeft from './chat-view-left';
import EmailAvatar from './email-avatar';
const { ComponentRegistry, WorkspaceStore } = require('mailspring-exports');

module.exports = {
  activate() {
    WorkspaceStore.defineSheet('ChatView', { root: true }, { list: ['RootSidebar', 'ChatView'] });
    ComponentRegistry.register(ChatView, { location: WorkspaceStore.Location.ChatView });
    if (AppEnv.isMainWindow()) {
      ComponentRegistry.register(ChatButton, {
        location: WorkspaceStore.Location.RootSidebar.Toolbar,
      });
      ComponentRegistry.register(ChatViewLeft, {
        location: WorkspaceStore.Sheet.Global.Footer,
      });
      ComponentRegistry.register(EmailAvatar, { role: 'EmailAvatar' });
    } else {
      AppEnv.getCurrentWindow().setMinimumSize(800, 600);
      ComponentRegistry.register(ChatView, {
        location: WorkspaceStore.Location.Center,
      });
    }
  },

  deactivate() {
    if (AppEnv.isMainWindow()) {
      ComponentRegistry.unregister(ChatButton);
      ComponentRegistry.unregister(ChatViewLeft);
      ComponentRegistry.unregister(EmailAvatar);
    } else {
      ComponentRegistry.unregister(ChatView);
    }
  }
};
