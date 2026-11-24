import React from 'react';
import { ListensToFluxStore, OutlineView, SVGIcons } from 'mailspring-component-kit';
import {
  Actions,
  DOMUtils,
  PreferencesUIStore,
  PreferencesUIStoreTab,
  localized,
} from 'mailspring-exports';

const ICONS_BY_TAB_ID = {
  General: SVGIcons.Settings,
  Accounts: SVGIcons.AtSign,
  Subscription: SVGIcons.PersonCircle,
  Appearance: SVGIcons.Palette,
  Shortcuts: SVGIcons.Keyboard,
  'Mail Rules': SVGIcons.Split,
  MCP: SVGIcons.Plug,
  Signatures: SVGIcons.Signature,
  Folders: SVGIcons.Folder,
  Templates: SVGIcons.FileText,
};

interface PreferencesSidebarProps {
  tabs: PreferencesUIStoreTab[];
  selection: {
    accountId: string;
    tabId: string;
  };
}

const PreferencesSectionList = ({ tabs, selection }: PreferencesSidebarProps) => (
  <nav className="preferences-sidebar" aria-label={localized('Preferences')}>
    <OutlineView
      items={tabs.map(({ tabId, displayName }) => {
        const Icon = ICONS_BY_TAB_ID[tabId] || SVGIcons.Settings;
        return {
          id: tabId,
          name: displayName,
          icon: <Icon />,
          children: [],
          selected: tabId === selection.tabId,
          onSelect: () => Actions.switchPreferencesTab(tabId),
        };
      })}
    />
  </nav>
);

export const PreferencesSidebar = ListensToFluxStore(PreferencesSectionList, {
  stores: [PreferencesUIStore],
  getStateFromStores: () => ({
    tabs: PreferencesUIStore.tabs(),
    selection: PreferencesUIStore.selection(),
  }),
});
PreferencesSidebar.displayName = 'PreferencesSidebar';
PreferencesSidebar.containerStyles = {
  minWidth: DOMUtils.getWorkspaceCssNumberProperty('account-sidebar-min-width', 165),
  maxWidth: DOMUtils.getWorkspaceCssNumberProperty('account-sidebar-max-width', 250),
};
