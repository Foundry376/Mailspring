import { localized, ComponentRegistry, ExtensionRegistry } from 'mailspring-exports';
import { HasTutorialTip } from 'mailspring-component-kit';

import { ToolbarSnooze, QuickActionSnooze } from './snooze-buttons';
import * as AccountSidebarExtension from './snooze-account-sidebar-extension';
import { SnoozeMailLabel } from './snooze-mail-label';
import { SnoozeStore } from './snooze-store';

export function activate() {
  const ToolbarSnoozeWithTutorialTip = HasTutorialTip(ToolbarSnooze, {
    title: localized('Handle it later!'),
    instructions: localized(
      "Snooze this email and it'll return to your inbox later. Click here or swipe across the thread in your inbox to snooze."
    ),
  });

  SnoozeStore.activate();
  ComponentRegistry.register(ToolbarSnoozeWithTutorialTip, { role: 'ThreadActionsToolbarButton' });
  ComponentRegistry.register(QuickActionSnooze, { role: 'ThreadListQuickAction' });
  ComponentRegistry.register(SnoozeMailLabel, { role: 'Thread:MailLabel' });
  ExtensionRegistry.AccountSidebar.register(AccountSidebarExtension);
}

export function deactivate() {
  ComponentRegistry.unregister(ToolbarSnooze);
  ComponentRegistry.unregister(QuickActionSnooze);
  ComponentRegistry.unregister(SnoozeMailLabel);
  ExtensionRegistry.AccountSidebar.unregister(AccountSidebarExtension);
  SnoozeStore.deactivate();
}

export function serialize() {}
