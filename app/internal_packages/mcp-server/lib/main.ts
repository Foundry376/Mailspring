import { localized, PreferencesUIStore } from 'mailspring-exports';
import McpServerManager from './mcp-server-manager';

let preferencesTab: any = null;

export function activate() {
  if (AppEnv.isMainWindow()) {
    McpServerManager.activate();
  }

  preferencesTab = new PreferencesUIStore.TabItem({
    tabId: 'MCP',
    displayName: localized('MCP Server'),
    componentClassFn: () => require('./preferences-mcp').default,
    order: 10,
  });
  PreferencesUIStore.registerPreferencesTab(preferencesTab);
}

export function deactivate() {
  McpServerManager.deactivate();
  if (preferencesTab) {
    PreferencesUIStore.unregisterPreferencesTab(preferencesTab.sectionId);
    preferencesTab = null;
  }
}

export function serialize() {
  return {};
}
