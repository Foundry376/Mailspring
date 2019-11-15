import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';

import ThreadList from './thread-list';
import ThreadListToolbar from './thread-list-toolbar';
import ThreadListEmptyFolderBar from './thread-list-empty-folder-bar';
import MessageListToolbar from './message-list-toolbar';
import SelectedItemsStack from './selected-items-stack';

import {
  ThreadListToolbarButtons,
  ThreadEmptyMoreButtons,
  MailActionsButtons,
  MailActionsPopoutButtons,
} from './thread-toolbar-buttons';

export function activate() {
  if (AppEnv.isMainWindow()) {
    ComponentRegistry.register(ThreadListEmptyFolderBar, {
      // location: WorkspaceStore.Location.ThreadList,
      role: 'ThreadListEmptyFolderBar',
    });

    ComponentRegistry.register(ThreadList, {
      location: WorkspaceStore.Location.ThreadList,
    });

    ComponentRegistry.register(SelectedItemsStack, {
      location: WorkspaceStore.Location.MessageList,
      modes: ['split'],
    });

    // Toolbars
    ComponentRegistry.register(ThreadListToolbar, {
      location: WorkspaceStore.Location.ThreadList.Toolbar,
      modes: ['list', 'split'],
      role: 'ThreadListToolbar',
    });

    ComponentRegistry.register(ThreadEmptyMoreButtons, {
      modes: ['list'],
      role: 'ThreadActionsToolbarButtonEmpty',
    });
  }
  ComponentRegistry.register(MessageListToolbar, {
    role: 'MessageListToolbar',
  });
  ComponentRegistry.register(ThreadListToolbarButtons, {
    role: 'ThreadListToolbarButtons',
  });
  ComponentRegistry.register(MailActionsButtons, {
    role: 'MailActionsToolbarButton',
  });
  ComponentRegistry.register(MailActionsPopoutButtons, {
    role: 'MailActionsToolbarButton',
  });
}

export function deactivate() {
  ComponentRegistry.unregister(ThreadList);
  ComponentRegistry.unregister(SelectedItemsStack);
  ComponentRegistry.unregister(ThreadListToolbar);
  ComponentRegistry.unregister(MessageListToolbar);
  ComponentRegistry.unregister(ThreadEmptyMoreButtons);
  ComponentRegistry.unregister(MailActionsButtons);
  ComponentRegistry.unregister(MailActionsPopoutButtons);
}
