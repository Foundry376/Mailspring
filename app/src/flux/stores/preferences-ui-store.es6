import { ipcRenderer } from 'electron';
import _ from 'underscore';
import MailspringStore from 'mailspring-store';
import WorkspaceStore from './workspace-store';
import FocusedPerspectiveStore from './focused-perspective-store';
import Actions from '../actions';

const MAIN_TAB_ITEM_ID = 'General';

class TabItem {
  constructor(opts = {}) {
    opts.order = opts.order || Infinity;
    Object.assign(this, opts);
  }
}

class PreferencesUIStore extends MailspringStore {
  constructor() {
    super();

    const perspective = FocusedPerspectiveStore.current();
    this._tabs = [];
    this._selection = {
      tabId: null,
      accountId: perspective.account ? perspective.account.id : null,
    };
    this.searchValue = '';
    this._filterTabs = [];
    this._filterSearchTabsDebounced = _.debounce(() => this._filterSearchTabs(), 100);
    this._triggerDebounced = _.debounce(() => this.trigger(), 20);
    this.setupListeners();
  }

  get TabItem() {
    return TabItem;
  }

  setupListeners() {
    if (AppEnv.isMainWindow()) {
      this.listenTo(Actions.openPreferences, this.openPreferences);
      ipcRenderer.on('open-preferences', this.openPreferences);

      this.listenTo(Actions.switchPreferencesTab, this.switchPreferencesTab);
    }

    AppEnv.commands.add(document.body, 'core:show-keybindings', () => {
      Actions.openPreferences();
      Actions.switchPreferencesTab('Shortcuts');
    });
  }

  tabs() {
    return this._filterTabs;
  }

  selection() {
    return this._selection;
  }

  onSearch = value => {
    this.searchValue = value;
    this._filterSearchTabsDebounced();
  };

  _filterSearchTabs() {
    if (this.searchValue === '') {
      this._filterTabs = this._tabs;
    } else {
      const searchStr = this.searchValue.toLowerCase();
      const filterTabIds = [];
      const searchTabs = this._tabs.filter(tab => {
        const groupList = (tab.configGroup || []).filter(group => {
          if ((group.groupName || '').toLowerCase().indexOf(searchStr) > -1) {
            return true;
          }
          // filter item's label and keywords
          const itemList = group.groupItem.filter(item => {
            // use zero-widthjoiner break up the string
            // To avoid finding error
            const searchStr = [item.label || '', ...(item.keywords || [])]
              .join('\u200D')
              .toLowerCase();
            if (searchStr.indexOf(searchStr) > -1) {
              return true;
            }
            return false;
          });
          if (itemList.length) {
            group.groupItem = itemList;
            return true;
          }
          return false;
        });
        if (groupList.length) {
          tab.configGroup = groupList;
          filterTabIds.push(tab.tabId);
          return true;
        }
        return false;
      });

      // deal with filter tabs
      if (filterTabIds.length === 0) {
        this._filterTabs = [this._tabs[0]];
        // deal with select tab
        this.switchPreferencesTab(this._tabs[0].tabId);
      } else {
        this._filterTabs = searchTabs;
        // deal with select tab
        if (filterTabIds.indexOf(this._selection.tabId) < 0) {
          this.switchPreferencesTab(filterTabIds[0]);
        }
      }
    }

    this._triggerDebounced();
  }

  openPreferences = () => {
    ipcRenderer.send('command', 'application:show-main-window');
    if (WorkspaceStore.topSheet() !== WorkspaceStore.Sheet.Preferences) {
      document.querySelector('#Center').style.zIndex = 9;
      Actions.pushSheet(WorkspaceStore.Sheet.Preferences);
    }
  };

  switchPreferencesTab = (tabId, options = {}) => {
    this._selection.tabId = tabId;
    if (options.accountId) {
      this._selection.accountId = options.accountId;
    }
    this.trigger();
  };

  /*
  Public: Register a new top-level section to preferences

  - `tabItem` a `PreferencesUIStore.TabItem` object
    schema definitions on the PreferencesUIStore.Section.MySectionId
    - `tabId` A unique name to access the Section by
    - `displayName` The display name. This may go through i18n.
    - `component` The Preference section's React Component.

  Most Preference sections include an area where a {PreferencesForm} is
  rendered. This is a type of {GeneratedForm} that uses the schema passed
  into {PreferencesUIStore::registerPreferences}

  */
  registerPreferencesTab = tabItem => {
    this._tabs.push(tabItem);
    this._tabs.sort((a, b) => a.order - b.order);
    if (tabItem.tabId === MAIN_TAB_ITEM_ID) {
      this._selection.tabId = tabItem.tabId;
    }
    this._filterSearchTabsDebounced();
  };

  unregisterPreferencesTab = tabItemOrId => {
    this._tabs = this._tabs.filter(s => s.tabId !== tabItemOrId && s !== tabItemOrId);
    this._filterSearchTabsDebounced();
  };
}

export default new PreferencesUIStore();
