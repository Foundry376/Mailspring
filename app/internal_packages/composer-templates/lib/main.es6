/* eslint global-require: 0 */
import { PreferencesUIStore, ComponentRegistry, ExtensionRegistry } from 'mailspring-exports';
import TemplatePicker from './template-picker';
import TemplateStatusBar from './template-status-bar';
import TemplateComposerExtension from './template-composer-extension';

export function activate(state = {}) {
  this.state = state;
  this.preferencesTab = new PreferencesUIStore.TabItem({
    tabId: 'Templates',
    displayName: 'Templates',
    order: 66,
    configGroup: [
      {
        groupItem: [
          {
            label: 'Templates',
            component: require('./preferences-templates').default,
            keywords: [],
          },
        ],
      },
    ],
  });
  ComponentRegistry.register(TemplatePicker, { role: 'Composer:ActionButton' });
  ComponentRegistry.register(TemplateStatusBar, { role: 'Composer:Footer' });
  PreferencesUIStore.registerPreferencesTab(this.preferencesTab);
  ExtensionRegistry.Composer.register(TemplateComposerExtension);
}

export function deactivate() {
  ComponentRegistry.unregister(TemplatePicker);
  ComponentRegistry.unregister(TemplateStatusBar);
  PreferencesUIStore.unregisterPreferencesTab(this.preferencesTab.tabId);
  ExtensionRegistry.Composer.unregister(TemplateComposerExtension);
}

export function serialize() {
  return this.state;
}
