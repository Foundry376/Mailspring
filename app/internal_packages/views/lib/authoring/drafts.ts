import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { VIEW_ID_REGEXP, draftsDir, installDir, notifyViewsChanged } from '../view-registry';

/**
 * Drafts are revisions of a View that preview in place of its installed copy until they are
 * promoted or discarded. They live on disk under <configDir>/views-drafts/<viewId>/ rather
 * than in memory because:
 *
 * - the main process serves them through the same protocol handler and path checks as
 *   installed Views, with no second code path or IPC channel for View source;
 * - an authoring session with a remote agent can span an app relaunch without losing the
 *   revision being previewed;
 * - installed copies are never written until the user (or loop) promotes the draft.
 */

// Matches MAX_VIEW_SOURCE_BYTES in view-sessions.ts; larger files would be refused there.
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const FILE_NAME_REGEXP = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface ViewRevision {
  manifest: { [key: string]: any };
  files: { [name: string]: string };
}

/**
 * Content hash of View.jsx: 12 hex chars of SHA-256 over its UTF-8 bytes. The main process
 * computes the same hash when it compiles the file and the loader reports it back, so
 * diagnostics can be matched to the revision that produced them.
 */
export function revisionOf(source: string) {
  return crypto.createHash('sha256').update(source, 'utf8').digest('hex').slice(0, 12);
}

export function validateRevision(viewId: string, revision: ViewRevision) {
  if (!VIEW_ID_REGEXP.test(viewId)) {
    throw new Error(`"${viewId}" is not a valid View id (lowercase letters, digits, dashes).`);
  }
  if (!revision || typeof revision.manifest !== 'object' || !revision.manifest) {
    throw new Error('A revision needs a manifest object.');
  }
  const files = revision.files || {};
  if (typeof files['View.jsx'] !== 'string') {
    throw new Error('A revision needs files["View.jsx"].');
  }
  for (const [name, content] of Object.entries(files)) {
    if (!FILE_NAME_REGEXP.test(name) || name === 'manifest.json') {
      throw new Error(`"${name}" is not an allowed file name.`);
    }
    if (typeof content !== 'string') throw new Error(`files["${name}"] must be a string.`);
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
      throw new Error(`files["${name}"] is larger than ${MAX_FILE_BYTES} bytes.`);
    }
  }
}

export function draftDirFor(viewId: string) {
  return path.join(draftsDir(), viewId);
}

export function hasDraft(viewId: string) {
  return fs.existsSync(path.join(draftDirFor(viewId), 'manifest.json'));
}

// Writes the bundle into a sibling temp directory and swaps it in, so the protocol handler
// never serves a half-written revision.
function writeBundle(dir: string, revision: ViewRevision) {
  const parent = path.dirname(dir);
  fs.mkdirSync(parent, { recursive: true });
  const tmp = path.join(parent, `.tmp-${path.basename(dir)}-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tmp);
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(revision.manifest, null, 2));
  for (const [name, content] of Object.entries(revision.files)) {
    fs.writeFileSync(path.join(tmp, name), content);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
}

function readBundle(dir: string): ViewRevision {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const files: { [name: string]: string } = {};
  for (const name of fs.readdirSync(dir)) {
    if (name === 'manifest.json' || !FILE_NAME_REGEXP.test(name)) continue;
    const file = path.join(dir, name);
    if (fs.statSync(file).isFile()) files[name] = fs.readFileSync(file, 'utf8');
  }
  return { manifest, files };
}

/** Writes `revision` as the View's draft. Returns the View.jsx revision hash. */
export function writeDraft(viewId: string, revision: ViewRevision) {
  validateRevision(viewId, revision);
  writeBundle(draftDirFor(viewId), revision);
  notifyViewsChanged([viewId], true);
  return revisionOf(revision.files['View.jsx']);
}

/** Makes the draft the installed copy (<configDir>/views/<viewId>/) and removes the draft. */
export function promoteDraft(viewId: string) {
  if (!hasDraft(viewId)) throw new Error(`View "${viewId}" has no draft to promote.`);
  const revision = readBundle(draftDirFor(viewId));
  writeBundle(path.join(installDir(), viewId), revision);
  fs.rmSync(draftDirFor(viewId), { recursive: true, force: true });
  notifyViewsChanged([viewId], true);
  return revisionOf(revision.files['View.jsx']);
}

/** Drops the draft; the View falls back to its installed copy, or disappears if it has none. */
export function discardDraft(viewId: string) {
  if (!hasDraft(viewId)) return false;
  fs.rmSync(draftDirFor(viewId), { recursive: true, force: true });
  notifyViewsChanged([viewId], true);
  return true;
}
