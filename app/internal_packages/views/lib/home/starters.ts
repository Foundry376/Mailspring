import fs from 'fs';
import path from 'path';
import { ViewManifest, readManifest } from '../view-registry';
import { ViewRevision, promoteDraft, writeDraft } from '../authoring/drafts';
import { newViewId } from './agent-adapter';

/**
 * Starters are Views that ship with the app. They're templates rather than Views: a starter
 * is never loaded from where it ships, it's copied to a new id so each install has its own
 * metadata namespace (`view:<id>`) and can be remixed without touching the original.
 */
export function startersDir() {
  return path.join(__dirname, '..', '..', 'starters');
}

export interface Starter extends ViewManifest {
  description: string;
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
      const manifest = readManifest(dir, id, 'installed');
      starters.push({ ...manifest, description: manifest.json.description || '' });
    } catch (err) {
      console.warn(`Views: skipping starter ${dir}: ${err.message}`);
    }
  }
  return starters;
}

export function readStarterRevision(starter: ViewManifest, viewId: string): ViewRevision {
  const files: { [name: string]: string } = {};
  for (const name of fs.readdirSync(starter.dir)) {
    if (name === 'manifest.json') continue;
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

/**
 * Copies a starter to a new View. `asDraft` previews it without installing: it shows in the
 * sidebar until the user keeps it (promoteDraft) or discards it.
 */
export function installStarter(starter: ViewManifest, { asDraft = false } = {}) {
  const viewId = newViewId(starter.name);
  writeDraft(viewId, readStarterRevision(starter, viewId));
  if (!asDraft) promoteDraft(viewId);
  return viewId;
}
