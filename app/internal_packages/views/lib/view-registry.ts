import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { apiVersionOf } from './api-version';

export type ViewSource = 'draft' | 'installed' | 'example';

export interface ViewManifest {
  id: string;
  name: string;
  placement: 'page' | 'thread-sidebar';
  permissions: string[];
  /** The View API the View was written against (lib/api-version.ts). */
  apiVersion: string;
  dir: string;
  source: ViewSource;
  /** The raw manifest.json, for placement-specific options (e.g. `sidebar`). */
  json: any;
}

// Must match VIEW_ID_REGEXP in app/src/browser/view-sandbox-policy.ts, which is what actually
// decides whether a View's partition gets a session.
export const VIEW_ID_REGEXP = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function draftsDir() {
  return path.join(AppEnv.getConfigDirPath(), 'views-drafts');
}

export function installDir() {
  return path.join(AppEnv.getConfigDirPath(), 'views');
}

export function examplesDir() {
  return path.join(__dirname, '..', 'examples');
}

/**
 * Bundle roots in precedence order; the first root containing a View wins. The main process
 * resolves bundles in the same order (viewPaths in app/src/browser/view-sessions.ts), so a
 * draft previews over the installed copy without touching it.
 */
export function viewBundleRoots(): { root: string; source: ViewSource }[] {
  const roots: { root: string; source: ViewSource }[] = [
    { root: draftsDir(), source: 'draft' },
    { root: installDir(), source: 'installed' },
  ];
  if (AppEnv.inDevMode()) {
    roots.push({ root: examplesDir(), source: 'example' });
  }
  return roots;
}

export function viewBundleDirs() {
  return viewBundleRoots().map((r) => r.root);
}

export function readManifest(dir: string, id: string, source: ViewSource): ViewManifest {
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  return {
    id,
    dir,
    source,
    json,
    name: json.name || id,
    placement: json.placement === 'thread-sidebar' ? 'thread-sidebar' : 'page',
    permissions: Array.isArray(json.permissions) ? json.permissions : [],
    apiVersion: apiVersionOf(json),
  };
}

/** Every View, keyed by directory name, with drafts shadowing installed copies. */
export function installedViews(): ViewManifest[] {
  const views = new Map<string, ViewManifest>();
  for (const { root, source } of viewBundleRoots()) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const id of entries.sort()) {
      if (!VIEW_ID_REGEXP.test(id) || views.has(id)) continue;
      const dir = path.join(root, id);
      try {
        views.set(id, readManifest(dir, id, source));
      } catch (err) {
        console.warn(`Views: skipping ${dir}: ${err.message}`);
      }
    }
  }
  return [...views.values()];
}

/**
 * Emits `changed` with the ids of Views whose bundles changed on disk, and whether the change
 * may affect the set of Views or their manifests (`structural`). The package reloads the
 * affected Views and, for structural changes, re-registers sidebar entries.
 */
export const ViewRegistryEvents = new EventEmitter();
ViewRegistryEvents.setMaxListeners(50);

export interface ViewsChange {
  viewIds: string[];
  structural: boolean;
}

export function notifyViewsChanged(viewIds: string[], structural = false) {
  ViewRegistryEvents.emit('changed', { viewIds, structural } as ViewsChange);
}
