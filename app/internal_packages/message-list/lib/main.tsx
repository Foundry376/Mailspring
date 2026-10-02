import {
  MailboxPerspective,
  ComponentRegistry,
  WorkspaceStore,
  DatabaseStore,
  Actions,
  Thread,
} from 'mailspring-exports';

import { MessageListHiddenMessagesToggle } from './message-list-hidden-messages-toggle';
import MessageList from './message-list';
import { SidebarPluginContainer } from './sidebar-plugin-container';
import { SidebarParticipantPicker } from './sidebar-participant-picker';
import { SidebarPanels } from './sidebar-panels';

export function activate() {
  if (AppEnv.isMainWindow()) {
    // Register Message List Actions we provide globally
    ComponentRegistry.register(MessageList, {
      location: WorkspaceStore.Location.MessageList,
    });
    // Registered first so the panel switcher sits at the top of the sidebar column.
    ComponentRegistry.register(SidebarPanels, {
      location: WorkspaceStore.Location.MessageListSidebar,
    });
    ComponentRegistry.register(SidebarParticipantPicker, {
      location: WorkspaceStore.Location.MessageListSidebar,
    });
    ComponentRegistry.register(SidebarPluginContainer, {
      location: WorkspaceStore.Location.MessageListSidebar,
    });
    ComponentRegistry.register(MessageListHiddenMessagesToggle, {
      role: 'MessageListHeaders',
    });
  } else {
    // This is for the thread-popout window.
    const { threadId, perspectiveJSON } = AppEnv.getWindowProps();
    ComponentRegistry.register(MessageList, { location: WorkspaceStore.Location.Center });

    // We need to locate the thread and focus it so that the MessageList displays it
    DatabaseStore.find<Thread>(Thread, threadId).then((thread) =>
      Actions.setFocus({ collection: 'thread', item: thread })
    );

    // Set the focused perspective and hide the proper messages
    // (e.g. we should hide deleted items from the inbox, but not from trash)
    Actions.focusMailboxPerspective(MailboxPerspective.fromJSON(perspectiveJSON));
    ComponentRegistry.register(MessageListHiddenMessagesToggle, {
      role: 'MessageListHeaders',
    });
  }
}

export function deactivate() {
  ComponentRegistry.unregister(MessageList);
  ComponentRegistry.unregister(SidebarPluginContainer);
  ComponentRegistry.unregister(SidebarParticipantPicker);
  ComponentRegistry.unregister(SidebarPanels);
}
