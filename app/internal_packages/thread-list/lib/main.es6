import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';

import ThreadList from './thread-list';
import ThreadListToolbar from './thread-list-toolbar';
import ThreadListEmptyFolderBar from './thread-list-empty-folder-bar';
import MessageListToolbar from './message-list-toolbar';
import SelectedItemsStack from './selected-items-stack';

import {
  MoveButtons,
  FlagButtons,
  NavButtons,
  ThreadMoreButtons,
  ThreadEmptyMoreButtons
}
  from './thread-toolbar-buttons';

export function activate() {
  ComponentRegistry.register(ThreadListEmptyFolderBar, {
    // location: WorkspaceStore.Location.ThreadList,
    role: 'ThreadListEmptyFolderBar'
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
    role: 'ThreadListToolbar'
  });

  ComponentRegistry.register(MessageListToolbar, {
    role: 'MessageListToolbar'
  });

  ComponentRegistry.register(MoveButtons, {
    role: 'ThreadActionsToolbarButton',
  });

  ComponentRegistry.register(FlagButtons, {
    role: 'ThreadActionsToolbarButton',
  });
  ComponentRegistry.register(ThreadMoreButtons, {
    role: 'ThreadActionsToolbarButton',
  });
  ComponentRegistry.register(ThreadEmptyMoreButtons, {
    modes: ['list'],
    role: 'ThreadActionsToolbarButtonEmpty',
  });
  ComponentRegistry.register(NavButtons, {
    role: 'MessageListToolbar'
  });
}

export function deactivate() {
  ComponentRegistry.unregister(ThreadList);
  ComponentRegistry.unregister(SelectedItemsStack);
  ComponentRegistry.unregister(ThreadListToolbar);
  ComponentRegistry.unregister(MessageListToolbar);
  ComponentRegistry.unregister(MoveButtons);
  ComponentRegistry.unregister(FlagButtons);
  ComponentRegistry.unregister(NavButtons);
  ComponentRegistry.unregister(ThreadMoreButtons);
  ComponentRegistry.unregister(ThreadEmptyMoreButtons);
}
