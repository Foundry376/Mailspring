import fs from 'fs';
import path from 'path';

export interface ViewManifest {
  id: string;
  name: string;
  placement: 'page' | 'thread-sidebar';
  permissions: string[];
  dir: string;
}

// Must match VIEW_ID_REGEXP in app/src/browser/view-sessions.ts, which is what actually
// decides whether a View's partition gets a session.
const VIEW_ID_REGEXP = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function viewBundleDirs() {
  const dirs = [path.join(AppEnv.getConfigDirPath(), 'views')];
  if (AppEnv.inDevMode()) {
    dirs.push(path.join(__dirname, '..', 'examples'));
  }
  return dirs;
}

/** Installed Views, keyed by directory name. The first bundle dir wins on collisions. */
export function installedViews(): ViewManifest[] {
  const views = new Map<string, ViewManifest>();
  for (const root of viewBundleDirs()) {
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
        const json = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
        views.set(id, {
          id,
          dir,
          name: json.name || id,
          placement: json.placement === 'thread-sidebar' ? 'thread-sidebar' : 'page',
          permissions: Array.isArray(json.permissions) ? json.permissions : [],
        });
      } catch (err) {
        console.warn(`Views: skipping ${dir}: ${err.message}`);
      }
    }
  }
  return [...views.values()];
}
