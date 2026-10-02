import fs from 'fs';
import path from 'path';
import { VIEW_ID_REGEXP, examplesDir, installDir, notifyViewsChanged } from '../view-registry';

// Editors write a file in several steps (truncate, write, rename); one reload per burst.
const DEBOUNCE_MS = 150;

/**
 * Dev mode only: watches installed and example View folders and reports changes, so a new
 * View folder appears in the sidebar and an edited one reloads without relaunching the app.
 * Drafts aren't watched; they change only through the authoring API, which reports its own
 * changes.
 */
export function watchViewFolders() {
  const watchers: fs.FSWatcher[] = [];
  let pending = new Set<string>();
  let structural = false;
  let timer: NodeJS.Timeout = null;

  const flush = () => {
    timer = null;
    notifyViewsChanged([...pending], structural);
    pending = new Set();
    structural = false;
  };

  for (const root of [installDir(), examplesDir()]) {
    try {
      fs.mkdirSync(root, { recursive: true });
      const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) {
          structural = true;
        } else {
          const [id, ...rest] = filename.toString().split(path.sep);
          if (!VIEW_ID_REGEXP.test(id)) return;
          // A new or removed folder, or a manifest edit, can change the sidebar.
          if (rest.length === 0 || rest.join('/') === 'manifest.json') structural = true;
          pending.add(id);
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, DEBOUNCE_MS);
      });
      watchers.push(watcher);
    } catch (err) {
      console.warn(`Views: can't watch ${root}: ${err.message}`);
    }
  }

  return () => {
    if (timer) clearTimeout(timer);
    watchers.forEach((w) => w.close());
  };
}
