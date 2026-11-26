import {
  ComponentRegistry,
  ExtensionRegistry,
  PreferencesUIStore,
  WorkspaceStore,
} from 'mailspring-exports';
import { configSchema } from './settings';
import { insightStore } from './stores/insight-store';
import { ThreadBadges } from './ui/thread-badges';
import { ThreadBrief } from './ui/thread-brief';
import { ComposerAIButton } from './ui/composer-button';
import { SiftSheet } from './ui/sift-sheet';
import { SiftNavButton, SHEET_ID } from './ui/nav-button';
import { SiftPreferences } from './ui/preferences';
import { sidebarExtension, stopLiveViews } from './ui/perspectives';
import { askStore } from './stores/ask-store';
import { replyWithAI, generateIntoSession } from './mail/composer';

const preferencesTab = new PreferencesUIStore.TabItem({
  tabId: 'Sift',
  displayName: 'Sift',
  componentClassFn: () => SiftPreferences,
  order: 12,
});

const sidebarExtensions = [sidebarExtension('needs_reply'), sidebarExtension('priority')];

// Mailspring applies this as the schema for the `sift.*` config keys.
export const config = configSchema;

export function activate() {
  insightStore.activate();
  if (AppEnv.inDevMode()) {
    // Handy from DevTools (and dev/cdp.mjs) when working on Sift.
    (window as any).__sift = { insightStore, askStore, replyWithAI, generateIntoSession };
  }

  // Composer windows (popouts) only need the AI button.
  ComponentRegistry.register(ComposerAIButton, { role: 'Composer:ActionButton' });
  if (AppEnv.getWindowType() === 'composer') return;

  ComponentRegistry.register(ThreadBadges, { role: 'Thread:MailLabel' });
  ComponentRegistry.register(ThreadBrief, { role: 'MessageListHeaders' });

  if (AppEnv.isMainWindow()) {
    sidebarExtensions.forEach((ext) => ExtensionRegistry.AccountSidebar.register(ext));
    const columns = ['RootSidebar', 'SiftContent'];
    // Defining the sheet also refreshes the sidebar so the smart views appear.
    WorkspaceStore.defineSheet(
      SHEET_ID,
      { root: true },
      { list: columns, split: columns, splitVertical: columns }
    );
    ComponentRegistry.register(SiftSheet, { location: WorkspaceStore.Location.SiftContent });
    ComponentRegistry.register(SiftNavButton, { role: 'NavRail:Item' });
    PreferencesUIStore.registerPreferencesTab(preferencesTab);
  }
}

export function deactivate() {
  insightStore.deactivate();
  stopLiveViews();
  ComponentRegistry.unregister(ComposerAIButton);
  ComponentRegistry.unregister(ThreadBadges);
  ComponentRegistry.unregister(ThreadBrief);
  if (AppEnv.isMainWindow()) {
    sidebarExtensions.forEach((ext) => ExtensionRegistry.AccountSidebar.unregister(ext));
    ComponentRegistry.unregister(SiftSheet);
    ComponentRegistry.unregister(SiftNavButton);
    PreferencesUIStore.unregisterPreferencesTab(preferencesTab.tabId);
    WorkspaceStore.undefineSheet(SHEET_ID);
  }
}
