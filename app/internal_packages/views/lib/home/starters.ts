import fs from 'fs';
import path from 'path';
import { ViewManifest, readManifest } from '../view-registry';
import { ViewRevision, writeView } from '../authoring/revisions';
import { newViewId } from '../agent/store';

/**
 * Starters are Views that ship with the app. They're templates rather than Views: a starter
 * is never loaded from where it ships, it's copied to a new id so each copy has its own
 * metadata namespace (`view:<id>`) and can be remixed without touching the original.
 */
export function startersDir() {
  return path.join(__dirname, '..', '..', 'starters');
}

// The starter's poster: its card image in the Views home, rendered from mock-data.json
// (home/starter-posters.ts). It stays with the starter and isn't copied into Views made from it.
export const STARTER_POSTER_FILE = 'poster.png';

export interface Starter extends ViewManifest {
  description: string;
  poster: string | null;
}

export function listStarters(): Starter[] {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(startersDir()).sort();
  } catch {
    return [];
  }
  const starters: Starter[] = [];
  for (const id of entries) {
    const dir = path.join(startersDir(), id);
    try {
      const manifest = readManifest(dir, id, 'user');
      const poster = path.join(dir, STARTER_POSTER_FILE);
      starters.push({
        ...manifest,
        description: manifest.json.description || '',
        poster: fs.existsSync(poster) ? poster : null,
      });
    } catch (err) {
      console.warn(`Views: skipping starter ${dir}: ${err.message}`);
    }
  }
  return starters;
}

export function readStarterRevision(starter: ViewManifest, viewId: string): ViewRevision {
  const files: { [name: string]: string } = {};
  for (const name of fs.readdirSync(starter.dir)) {
    if (name === 'manifest.json' || name === STARTER_POSTER_FILE) continue;
    const file = path.join(starter.dir, name);
    if (fs.statSync(file).isFile()) files[name] = fs.readFileSync(file, 'utf8');
  }
  const manifest = {
    ...starter.json,
    id: viewId,
    starter: { id: starter.id, version: starter.json.version || null },
  };
  return { manifest, files };
}

/** Copies a starter to a new View and returns its id. */
export function installStarter(starter: ViewManifest) {
  const viewId = newViewId(starter.name);
  writeView(viewId, readStarterRevision(starter, viewId));
  return viewId;
}
