import { ComponentRegistry } from 'mailspring-exports';
import {
  WorkspaceStore
} from 'mailspring-exports';
import MyComposerButton from './my-composer-button';
import MyMessageSidebar from './my-message-sidebar';

// Activate is called when the package is loaded. If your package previously
// saved state using `serialize` it is provided.
//
export function activate() {
  if (WorkspaceStore.Location.RootSidebar && WorkspaceStore.Location.RootSidebar.Toolbar) {
    ComponentRegistry.register(MyComposerButton, {
      location: WorkspaceStore.Location.RootSidebar.Toolbar,
    });
  }

  // ComponentRegistry.register(MyMessageSidebar, {
  //   role: 'MessageListSidebar:ContactCard',
  // });

  // const { fork } = require('child_process');
  // const ps = fork(`${__dirname}/child.js`);

}

// Serialize is called when your package is about to be unmounted.
// You can return a state object that will be passed back to your package
// when it is re-activated.
//
export function serialize() { }

// This **optional** method is called when the window is shutting down,
// or when your package is being updated or disabled. If your package is
// watching any files, holding external resources, providing commands or
// subscribing to events, release them here.
//
export function deactivate() {
  ComponentRegistry.unregister(MyComposerButton);
  // ComponentRegistry.unregister(MyMessageSidebar);
}
