import {
  PreferencesUIStore,
  PreferencesUIStoreTab,
} from '../../src/flux/stores/preferences-ui-store';

describe('PreferencesUIStore', function () {
  let registeredTabs: PreferencesUIStoreTab[];

  beforeEach(function () {
    registeredTabs = PreferencesUIStore._tabs;
    PreferencesUIStore._tabs = [];
  });

  afterEach(function () {
    PreferencesUIStore._tabs = registeredTabs;
  });

  const register = (tabId: string, order?: number) =>
    PreferencesUIStore.registerPreferencesTab(
      new PreferencesUIStoreTab({ tabId, displayName: tabId, componentClassFn: () => null, order })
    );

  it('lists tabs by order, then tabs without one in the order they registered', function () {
    register('Signatures');
    register('MCP', 10);
    register('Accounts', 2);
    register('Folders');
    register('General', 1);

    expect(PreferencesUIStore.tabs().map((t) => t.tabId)).toEqual([
      'General',
      'Accounts',
      'MCP',
      'Signatures',
      'Folders',
    ]);
  });
});
