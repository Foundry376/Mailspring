/* eslint global-require: "off" */

// // Translation Plugin
// Last Revised: Feb. 29, 2016 by Ben Gotow

// TranslateButton is a simple React component that allows you to select
// a language from a popup menu and translates draft text into that language.

import { ComponentRegistry, ExtensionRegistry } from 'mailspring-exports';
import { TranslateComposerButton } from './composer-button';
import { TranslateMessageHeader, TranslateMessageExtension } from './message-header';
/*
All packages must export a basic object that has at least the following 3
methods:

1. `activate` - Actions to take once the package gets turned on.
Pre-enabled packages get activated on Mailspring bootup. They can also be
activated manually by a user.

2. `deactivate` - Actions to take when a package gets turned off. This can
happen when a user manually disables a package.
*/

export function activate() {
  ExtensionRegistry.MessageView.register(TranslateMessageExtension);

  ComponentRegistry.register(TranslateComposerButton, {
    role: 'Composer:ActionButton',
  });
  ComponentRegistry.register(TranslateMessageHeader, {
    role: 'message:BodyHeader',
  });
}

export function deactivate() {
  ExtensionRegistry.MessageView.unregister(TranslateMessageExtension);
  ComponentRegistry.unregister(TranslateComposerButton);
  ComponentRegistry.unregister(TranslateMessageHeader);
}
