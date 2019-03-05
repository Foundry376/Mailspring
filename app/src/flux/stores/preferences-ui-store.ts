import { ipcRenderer } from 'electron';
import _ from 'underscore';
import MailspringStore from 'mailspring-store';
import WorkspaceStore from './workspace-store';
import FocusedPerspectiveStore from './focused-perspective-store';
import * as Actions from '../actions';

const MAIN_TAB_ITEM_ID = 'General';

export class PreferencesUIStoreTab {
  order: number;
  tabId: string;
  displayName: string;
  componentClassFn: () => any;

  constructor(opts: {
    tabId: string;
    displayName: string;
    componentClassFn: () => any;
    order?: number;
  }) {
    this.tabId = opts.tabId;
    this.componentClassFn = opts.componentClassFn;
    this.displayName = opts.displayName;
    this.order = opts.order || Infinity;
  }
}

class _PreferencesUIStore extends MailspringStore {
  _tabs: PreferencesUIStoreTab[] = [];
  _selection = {
    tabId: null,
    accountId: null,
  };

  constructor() {
    super();

    const perspective = FocusedPerspectiveStore.current();
    this._selection = {
      tabId: null,
      accountId: perspective['account'] ? perspective['account'].id : null,
    };

    this.setupListeners();
  }

  get TabItem() {
    return PreferencesUIStoreTab;
  }

  _triggerDebounced = _.debounce(() => this.trigger(), 20);

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
    return this._tabs;
  }

  selection() {
    return this._selection;
  }

  openPreferences = () => {
    ipcRenderer.send('command', 'application:show-main-window');
    if (WorkspaceStore.topSheet() !== WorkspaceStore.Sheet.Preferences) {
      Actions.pushSheet(WorkspaceStore.Sheet.Preferences);
    }
  };

  switchPreferencesTab = (tabId, options: { accountId?: string } = {}) => {
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
  registerPreferencesTab = (tabItem: PreferencesUIStoreTab) => {
    this._tabs.push(tabItem);
    this._tabs.sort((a, b) => (a.order > b.order) as any);
    if (tabItem.tabId === MAIN_TAB_ITEM_ID) {
      this._selection.tabId = tabItem.tabId;
    }
    this._triggerDebounced();
  };

  unregisterPreferencesTab = tabItemOrId => {
    this._tabs = this._tabs.filter(s => s.tabId !== tabItemOrId && s !== tabItemOrId);
    this._triggerDebounced();
  };
}

export const PreferencesUIStore = new _PreferencesUIStore();
