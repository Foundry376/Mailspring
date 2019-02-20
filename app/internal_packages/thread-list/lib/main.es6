import { ComponentRegistry, WorkspaceStore } from 'mailspring-exports';

import ThreadList from './thread-list';
import ThreadListToolbar from './thread-list-toolbar';
import ThreadListEmptyFolderBar from './thread-list-empty-folder-bar';
import MessageListToolbar from './message-list-toolbar';
import SelectedItemsStack from './selected-items-stack';

import { UpButton, DownButton, MoveButtons, FlagButtons } from './thread-toolbar-buttons';

export function activate() {
  ComponentRegistry.register(ThreadListEmptyFolderBar, {
    location: WorkspaceStore.Location.ThreadList,
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
    location: WorkspaceStore.Location.MessageList.Toolbar,
  });

  ComponentRegistry.register(DownButton, {
    location: WorkspaceStore.Location.MessageList.Toolbar,
    modes: ['list'],
  });

  ComponentRegistry.register(UpButton, {
    location: WorkspaceStore.Location.MessageList.Toolbar,
    modes: ['list'],
  });

  ComponentRegistry.register(MoveButtons, {
    role: 'ThreadActionsToolbarButton',
  });

  ComponentRegistry.register(FlagButtons, {
    role: 'ThreadActionsToolbarButton',
  });
}

export function deactivate() {
  ComponentRegistry.unregister(ThreadList);
  ComponentRegistry.unregister(SelectedItemsStack);
  ComponentRegistry.unregister(ThreadListToolbar);
  ComponentRegistry.unregister(MessageListToolbar);
  ComponentRegistry.unregister(MoveButtons);
  ComponentRegistry.unregister(FlagButtons);
  ComponentRegistry.unregister(UpButton);
  ComponentRegistry.unregister(DownButton);
}
