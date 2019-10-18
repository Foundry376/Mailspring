/* eslint global-require: 0 */
import { PreferencesUIStore, WorkspaceStore, ComponentRegistry } from 'mailspring-exports';

import PreferencesRoot from './preferences-root';

export function activate() {
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'General',
      displayName: 'General',
      componentClassFn: () => require('./tabs/preferences-general').default,
      order: 1,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Notifications',
      displayName: 'Notifications',
      componentClassFn: () => require('./tabs/preferences-notifications').default,
      order: 2,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Accounts',
      displayName: 'Accounts',
      componentClassFn: () => require('./tabs/preferences-accounts').default,
      order: 3,
    })
  );

  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Appearance',
      displayName: 'Appearance',
      componentClassFn: () => require('./tabs/preferences-appearance').default,
      order: 4,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Customize Actions',
      displayName: 'Customize Actions',
      componentClassFn: () => require('./tabs/preferences-customize-actions').default,
      order: 5,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Shortcuts',
      displayName: 'Shortcuts',
      componentClassFn: () => require('./tabs/preferences-keymaps').default,
      order: 6,
    })
  );
  // order in [65-128] is for package
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Blocked Senders',
      displayName: 'Blocked Senders',
      order: 129,
      componentClassFn: () => require('./tabs/preferences-blocked-senders').default,
    })
  );

  WorkspaceStore.defineSheet(
    'Preferences',
    {},
    {
      split: ['Preferences'],
      list: ['Preferences'],
    }
  );

  ComponentRegistry.register(PreferencesRoot, {
    location: WorkspaceStore.Location.Preferences,
  });
}

export function deactivate() {}

export function serialize() {
  return this.state;
}
