/* eslint global-require: 0 */
import React from 'react';
import {
  localized,
  PreferencesUIStore,
  WorkspaceStore,
  ComponentRegistry,
  IdentityStore,
  AccountStore,
} from 'mailspring-exports';
import { NavRailItem, ListensToFluxStore } from 'mailspring-component-kit';

import PreferencesRoot from './preferences-root';

// The Mailspring ID is absent while signed out.
function userInitial() {
  const account = AccountStore.accounts()[0];
  const name = IdentityStore.identity()?.firstName || account?.name || account?.emailAddress || '';
  return name.trim().charAt(0).toUpperCase();
}

const PreferencesNavRailItemInner = ({ initial }: { initial: string }) => (
  <NavRailItem
    label={localized('Preferences')}
    command="application:open-preferences"
    isActive={() => WorkspaceStore.rootSheet() === WorkspaceStore.Sheet.Preferences}
  >
    <span className="nav-rail-initial">{initial}</span>
  </NavRailItem>
);
PreferencesNavRailItemInner.displayName = 'PreferencesNavRailItem';

const PreferencesNavRailItem = ListensToFluxStore(PreferencesNavRailItemInner, {
  stores: [IdentityStore, AccountStore],
  getStateFromStores: () => ({ initial: userInitial() }),
});

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
