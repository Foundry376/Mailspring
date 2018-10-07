import { localized, PreferencesUIStore } from 'mailspring-exports';

export function activate() {
  this.preferencesTab = new PreferencesUIStore.TabItem({
    tabId: 'Folders',
    displayName: localized('Folders'),
    componentClassFn: () => require('./preferences-category-mapper').default,
  });

  PreferencesUIStore.registerPreferencesTab(this.preferencesTab);
}

export function deactivate() {
  PreferencesUIStore.unregisterPreferencesTab(this.preferencesTab.sectionId);
}
