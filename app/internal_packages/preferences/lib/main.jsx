/* eslint global-require: 0 */
import React from 'react';
import { PreferencesUIStore, WorkspaceStore, ComponentRegistry } from 'mailspring-exports';
import PreferencesRoot from './preferences-root';
import preferencesTemplateFills from './preferences-template-fill';
import PreferencesContentTemplate from './components/preferences-content-template';

export function activate() {
  const tabItemList = preferencesTemplateFills.tables;
  tabItemList.forEach(tab => {
    const item = new PreferencesUIStore.TabItem({
      tabId: tab.tabId,
      displayName: tab.displayName,
      componentClassFn: () => PreferencesContentTemplate,
      order: tab.order,
      className: tab.className,
      configGroup: tab.configGroup,
    });
    PreferencesUIStore.registerPreferencesTab(item);
  });

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
