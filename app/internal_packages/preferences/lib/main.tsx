/* eslint global-require: 0 */
import React from 'react';
import { ipcRenderer } from 'electron';
import {
  localized,
  Actions,
  PreferencesUIStore,
  WorkspaceStore,
  ComponentRegistry,
  IdentityStore,
  AccountStore,
} from 'mailspring-exports';
import { NavRailItem } from 'mailspring-component-kit';

import PreferencesRoot from './preferences-root';

// Names the Mailspring ID, or the first account while signed out of it.
function whoMenuItems(): Electron.MenuItemConstructorOptions[] {
  const identity = IdentityStore.identity();
  const account = AccountStore.accounts()[0];
  const lines = identity
    ? [`${identity.firstName} ${identity.lastName}`.trim(), identity.emailAddress]
    : [account.name, account.emailAddress];
  return lines.filter(Boolean).map((label) => ({ label, enabled: false }));
}

const settingsMenuTemplate = (): Electron.MenuItemConstructorOptions[] => [
  ...whoMenuItems(),
  { type: 'separator' },
  {
    label: localized('Preferences'),
    accelerator: 'CmdOrCtrl+,',
    click: () => Actions.openPreferences(),
  },
  {
    label: `${localized('Change Theme')}...`,
    click: () => AppEnv.commands.dispatch('window:launch-theme-picker'),
  },
  { type: 'separator' },
  {
    label: `${localized('Add Account')}...`,
    click: () => ipcRenderer.send('command', 'application:add-account'),
  },
  {
    label: `${localized('Manage Accounts')}...`,
    click: () => {
      Actions.switchPreferencesTab('Accounts');
      Actions.openPreferences();
    },
  },
];

const PreferencesNavRailItem = () => (
  <NavRailItem
    label={localized('Preferences')}
    iconName="settings.png"
    menuTemplate={settingsMenuTemplate}
    isActive={() => WorkspaceStore.rootSheet() === WorkspaceStore.Sheet.Preferences}
  />
);
PreferencesNavRailItem.displayName = 'PreferencesNavRailItem';

export function activate() {
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'General',
      displayName: localized('General'),
      componentClassFn: () => require('./tabs/preferences-general').default,
      order: 1,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Accounts',
      displayName: localized('Accounts'),
      componentClassFn: () => require('./tabs/preferences-accounts').default,
      order: 2,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Subscription',
      displayName: localized('Subscription'),
      componentClassFn: () => require('./tabs/preferences-identity').default,
      order: 3,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Appearance',
      displayName: localized('Appearance'),
      componentClassFn: () => require('./tabs/preferences-appearance').default,
      order: 4,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Shortcuts',
      displayName: localized('Shortcuts'),
      componentClassFn: () => require('./tabs/preferences-keymaps').default,
      order: 5,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'Mail Rules',
      displayName: localized('Mail Rules'),
      componentClassFn: () => require('./tabs/preferences-mail-rules').default,
      order: 6,
    })
  );
  PreferencesUIStore.registerPreferencesTab(
    new PreferencesUIStore.TabItem({
      tabId: 'AI',
      displayName: localized('AI'),
      componentClassFn: () => require('./tabs/preferences-ai').default,
      order: 7,
    })
  );

  WorkspaceStore.defineSheet(
    'Preferences',
    { root: true },
    {
      list: ['Preferences'],
      split: ['Preferences'],
      splitVertical: ['Preferences'],
    }
  );

  ComponentRegistry.register(PreferencesRoot, {
    location: WorkspaceStore.Location.Preferences,
  });
  ComponentRegistry.register(PreferencesNavRailItem, { role: 'NavRail:FooterItem' });
}

export function deactivate() {
  ComponentRegistry.unregister(PreferencesNavRailItem);
}

export function serialize() {
  return this.state;
}
