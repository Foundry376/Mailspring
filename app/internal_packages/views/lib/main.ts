import { ComponentRegistry, WorkspaceStore, localized } from 'mailspring-exports';
import { ViewManifest, ViewRegistryEvents, ViewsChange, installedViews } from './view-registry';
import { ViewsNavStore } from './views-nav';
import { ViewsRoot } from './views-root';
import { createSidebarViewComponent } from './sidebar-view';
import { ViewsNavRailSection } from './nav/views-nav-rail';
import { startTrackingBadges, stopTrackingBadges } from './nav/badges';
import { reloadMountedView, hostsFor } from './authoring/hosts';
import { watchViewFolders } from './authoring/watcher';
import { ViewAuthoring } from './authoring';
import { registerAuthoringPanel, unregisterAuthoringPanel } from './authoring-panel';
import { captureThumbnailsOnRender } from './home/thumbnails';

let sidebarComponents = [];
let registeredSignature = '';
let unwatch: () => void = null;
let commands: { dispose(): void } = null;
let stopThumbnails: () => void = null;

function unregisterViews() {
  sidebarComponents.forEach((component) => ComponentRegistry.unregister(component));
  sidebarComponents = [];
}

// What the registered sidebar Views depend on. Re-registering only when it changes keeps
// mounted sidebar Views alive across code-only edits, which reload in place instead.
function registrationSignature(views: ViewManifest[]) {
  return JSON.stringify(
    views.map((v) => [v.id, v.name, v.placement, v.json && v.json.sidebar, v.permissions])
  );
}

/**
 * Registers the MessageListSidebar component for each thread-sidebar View. Page Views are
 * listed by the nav rail's Views section, which follows the registry itself. Runs at
 * activation and again whenever the set of Views or their manifests change.
 */
function registerViews() {
  const views = installedViews();
  const signature = registrationSignature(views);
  if (signature === registeredSignature) return;
  registeredSignature = signature;
  unregisterViews();

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
  const viewId = ViewsNavStore.focusedPageViewId();
  if (viewId) reloadMountedView(viewId);
  // Sidebar Views are visible alongside any perspective.
  installedViews()
    .filter((v) => v.placement === 'thread-sidebar' && hostsFor(v.id).length)
    .forEach((v) => reloadMountedView(v.id));
}

// Back from a thread a View opened returns to that View, so it's named after the View.
function viewsBackTitle() {
  const viewId = ViewsNavStore.viewId();
  const view = viewId && installedViews().find((v) => v.id === viewId);
  return view ? view.name : localized('Views');
}

export function activate() {
  // `list` is the only mode, whatever the user's reading-pane preference: focusing a thread
  // from a View then pushes the Thread sheet over it, with the standard toolbar and Back.
  // No mailbox sidebar: Views are a section of their own, switched from the nav rail.
  WorkspaceStore.defineSheet(
    'Views',
    { root: true, backTitle: viewsBackTitle },
    { list: ['ViewContent'] }
  );
  ComponentRegistry.register(ViewsRoot, { location: WorkspaceStore.Location.ViewContent });
  registerAuthoringPanel();
  ComponentRegistry.register(ViewsNavRailSection, { role: 'NavRail:Section' });
  stopThumbnails = captureThumbnailsOnRender();

  startTrackingBadges();
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
  stopTrackingBadges();
  ViewRegistryEvents.removeListener('changed', onViewsChanged);
  if (unwatch) unwatch();
  if (commands) commands.dispose();
  unwatch = null;
  commands = null;
  unregisterViews();
  registeredSignature = '';
  if (stopThumbnails) stopThumbnails();
  stopThumbnails = null;
  ComponentRegistry.unregister(ViewsNavRailSection);
  ComponentRegistry.unregister(ViewsRoot);
  unregisterAuthoringPanel();
}
