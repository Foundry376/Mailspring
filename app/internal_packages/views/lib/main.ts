import {
  ComponentRegistry,
  ExtensionRegistry,
  FocusedPerspectiveStore,
  WorkspaceStore,
} from 'mailspring-exports';
import { ViewManifest, ViewRegistryEvents, ViewsChange, installedViews } from './view-registry';
import { ViewMailboxPerspective } from './view-mailbox-perspective';
import { ViewsRoot } from './views-root';
import { createSidebarViewComponent } from './sidebar-view';
import { ViewBridgeEvents } from './bridge/view-events';
import { reloadMountedView, hostsFor } from './authoring/hosts';
import { watchViewFolders } from './authoring/watcher';
import { ViewAuthoring } from './authoring';

let sidebarExtensions = [];
let sidebarComponents = [];
let registeredSignature = '';
let unwatch: () => void = null;
let commands: { dispose(): void } = null;

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

function unregisterViews() {
  sidebarExtensions.forEach((ext) => ExtensionRegistry.AccountSidebar.unregister(ext));
  sidebarComponents.forEach((component) => ComponentRegistry.unregister(component));
  sidebarExtensions = [];
  sidebarComponents = [];
}

// What the registered sidebar entries depend on. Re-registering only when it changes keeps
// mounted sidebar Views alive across code-only edits, which reload in place instead.
function registrationSignature(views: ViewManifest[]) {
  return JSON.stringify(
    views.map((v) => [v.id, v.name, v.placement, v.json && v.json.sidebar, v.permissions])
  );
}

/**
 * Registers the account-sidebar entry for each page View and the MessageListSidebar
 * component for each thread-sidebar View. Runs at activation and again whenever the set of
 * Views or their manifests change (new folder, promoted or discarded draft, manifest edit).
 */
function registerViews() {
  const views = installedViews();
  const signature = registrationSignature(views);
  if (signature === registeredSignature) return;
  registeredSignature = signature;
  unregisterViews();

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
    ComponentRegistry.register(
      component,
      (component as any).sidebarPanel
        ? { role: 'MessageListSidebar:Panel' }
        : { location: WorkspaceStore.Location.MessageListSidebar }
    )
  );
}

// Structural changes may add, remove or re-place Views; re-registering a sidebar component
// remounts it, so it loads the new code by itself. Everything else reloads in place.
function onViewsChanged({ viewIds, structural }: ViewsChange) {
  if (structural) registerViews();
  viewIds.forEach((id) => reloadMountedView(id));
}

function reloadFocusedViews() {
  const perspective = FocusedPerspectiveStore.current();
  if (perspective instanceof ViewMailboxPerspective) {
    reloadMountedView(perspective.viewId);
  }
  // Sidebar Views are visible alongside any perspective.
  installedViews()
    .filter((v) => v.placement === 'thread-sidebar' && hostsFor(v.id).length)
    .forEach((v) => reloadMountedView(v.id));
}

export function activate() {
  // `list` is the only mode, whatever the user's reading-pane preference: focusing a thread
  // from a View then pushes the Thread sheet over it, with the standard toolbar and Back.
  WorkspaceStore.defineSheet('Views', { root: true }, { list: ['RootSidebar', 'ViewContent'] });
  ComponentRegistry.register(ViewsRoot, { location: WorkspaceStore.Location.ViewContent });

  loadBadges();
  ViewBridgeEvents.on('badge', onBadge);
  registeredSignature = '';
  registerViews();
  ViewRegistryEvents.on('changed', onViewsChanged);

  commands = AppEnv.commands.add(document.body, {
    'views:reload-view': reloadFocusedViews,
  });

  if (AppEnv.inDevMode()) {
    unwatch = watchViewFolders();
    // `$m.ViewAuthoring` in the DevTools console: previewView, reloadView, getDiagnostics…
    (window as any).$m.ViewAuthoring = ViewAuthoring;
  }
}

export function deactivate() {
  ViewBridgeEvents.removeListener('badge', onBadge);
  ViewRegistryEvents.removeListener('changed', onViewsChanged);
  if (unwatch) unwatch();
  if (commands) commands.dispose();
  unwatch = null;
  commands = null;
  unregisterViews();
  registeredSignature = '';
  ComponentRegistry.unregister(ViewsRoot);
}
