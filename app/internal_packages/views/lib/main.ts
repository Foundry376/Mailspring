import { ComponentRegistry, ExtensionRegistry, WorkspaceStore } from 'mailspring-exports';
import { installedViews } from './view-registry';
import { ViewMailboxPerspective } from './view-mailbox-perspective';
import { ViewsRoot } from './views-root';
import { createSidebarViewComponent } from './sidebar-view';
import { ViewBridgeEvents } from './bridge/view-events';

let sidebarExtensions = [];
let sidebarComponents = [];

// The last count each View reported with `ui.setBadge`. A page View only runs while it is
// open, so the count is remembered across launches and shown until the View next changes it.
const BADGES_KEY = 'views-badges';
let badges: { [viewId: string]: number } = {};

function loadBadges() {
  try {
    badges = JSON.parse(window.localStorage.getItem(BADGES_KEY) || '{}') || {};
  } catch {
    badges = {};
  }
}

function onBadge(viewId: string, count: number | null) {
  if ((badges[viewId] || null) === (count || null)) return;
  if (count) badges[viewId] = count;
  else delete badges[viewId];
  try {
    window.localStorage.setItem(BADGES_KEY, JSON.stringify(badges));
  } catch {
    // The badge still shows for this session.
  }
  ExtensionRegistry.AccountSidebar.triggerDebounced();
}

export function activate() {
  // Every mode has the same columns: ViewsRoot lays out the reading pane itself so it can
  // appear only once a View opens a thread. Declaring all three modes keeps the user's
  // preference in effect, which is what makes `list` mode push the Thread sheet.
  const columns = ['RootSidebar', 'ViewContent'];
  WorkspaceStore.defineSheet(
    'Views',
    { root: true },
    { list: columns, split: columns, splitVertical: columns }
  );
  ComponentRegistry.register(ViewsRoot, { location: WorkspaceStore.Location.ViewContent });

  const views = installedViews();
  loadBadges();
  ViewBridgeEvents.on('badge', onBadge);

  sidebarExtensions = views
    .filter((view) => view.placement === 'page')
    .map((view) => ({
      name: `View:${view.id}`,
      sidebarItem(accountIds: string[]) {
        return {
          id: `View:${view.id}`,
          name: view.name,
          iconName: 'folder.png',
          perspective: new ViewMailboxPerspective(accountIds, view.id, view.name),
          // Views aren't account-scoped, so per-account children would all be identical.
          perAccount: false,
          count: badges[view.id] || 0,
        };
      },
    }));
  sidebarExtensions.forEach((ext) => ExtensionRegistry.AccountSidebar.register(ext));

  sidebarComponents = views
    .filter((view) => view.placement === 'thread-sidebar')
    .map((view) => createSidebarViewComponent(view));
  sidebarComponents.forEach((component) =>
    ComponentRegistry.register(component, { location: WorkspaceStore.Location.MessageListSidebar })
  );
}

export function deactivate() {
  ViewBridgeEvents.removeListener('badge', onBadge);
  sidebarExtensions.forEach((ext) => ExtensionRegistry.AccountSidebar.unregister(ext));
  sidebarComponents.forEach((component) => ComponentRegistry.unregister(component));
  sidebarExtensions = [];
  sidebarComponents = [];
  ComponentRegistry.unregister(ViewsRoot);
}
