import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { VIEW_ID_REGEXP, allViews, installDir, notifyViewsChanged } from '../view-registry';
import { withApiVersion } from '../api-version';
import { narrowApprovalToCurrent } from '../consent';

/**
 * A View is its folder under <configDir>/views/<viewId>/, and every revision is written there
 * directly: an edit is live as soon as it's applied. A View the user asked the agent to build
 * starts as a folder with only a manifest, so it has a home card before its first revision. Before the first revision of each request
 * the authoring agent works on, the folder is copied to a checkpoint under
 * <configDir>/views-checkpoints/<viewId>/, and reverting restores the newest one.
 */

// Matches MAX_VIEW_SOURCE_BYTES in view-sessions.ts; larger files would be refused there.
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const FILE_NAME_REGEXP = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_CHECKPOINTS = 10;
// How long after this module writes a View the dev-mode folder watcher ignores it: the write
// already reported itself, and a second reload would race the revision's render outcome.
const OWN_WRITE_GRACE_MS = 1000;
const ownWrites = new Map<string, number>();

export function isOwnRecentWrite(viewId: string) {
  return Date.now() - (ownWrites.get(viewId) || 0) < OWN_WRITE_GRACE_MS;
}

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

// Every path below is removed recursively somewhere, so the id is checked where it's joined.
function assertViewId(viewId: string) {
  if (!VIEW_ID_REGEXP.test(viewId)) throw new Error(`"${viewId}" is not a valid View id.`);
}

function viewDirFor(viewId: string) {
  assertViewId(viewId);
  return path.join(installDir(), viewId);
}

function checkpointDirFor(viewId: string) {
  assertViewId(viewId);
  return path.join(AppEnv.getConfigDirPath(), 'views-checkpoints', viewId);
}

// Writes the bundle into a sibling temp directory and swaps it in, so the protocol handler
// never serves a half-written revision.
function writeBundle(dir: string, revision: ViewRevision) {
  if (path.dirname(dir) === installDir()) ownWrites.set(path.basename(dir), Date.now());
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

function hasCode(viewId: string) {
  return fs.existsSync(path.join(viewDirFor(viewId), 'View.jsx'));
}

/** The View's manifest and files as they are now, wherever it's loaded from, or null if it
 * has no code yet. */
export function readViewBundle(viewId: string): ViewRevision | null {
  const view = allViews().find((v) => v.id === viewId);
  return view && view.built ? readBundle(view.dir) : null;
}

/** Creates a View with no code yet, for the agent to build. */
export function createUnbuiltView(viewId: string, name: string) {
  writeBundle(viewDirFor(viewId), {
    manifest: withApiVersion({ name, placement: 'page', permissions: [] }),
    files: {},
  });
  notifyViewsChanged([viewId], true);
}

/**
 * Writes `revision` as the View and returns its View.jsx revision hash. A manifest without
 * `apiVersion` is stamped with the current one: whoever wrote it wrote it against this API.
 */
export function writeView(viewId: string, revision: ViewRevision) {
  validateRevision(viewId, revision);
  writeBundle(viewDirFor(viewId), { ...revision, manifest: withApiVersion(revision.manifest) });
  notifyViewsChanged([viewId], true);
  return revisionOf(revision.files['View.jsx']);
}

/** The hash of the View's View.jsx as it is on disk, or null if the View doesn't exist. */
export function currentRevisionOf(viewId: string) {
  try {
    return revisionOf(fs.readFileSync(path.join(viewDirFor(viewId), 'View.jsx'), 'utf8'));
  } catch {
    return null;
  }
}

// Checkpoint folders are named by creation time, so sorting the names orders them.
function checkpointNames(viewId: string) {
  try {
    return fs
      .readdirSync(checkpointDirFor(viewId))
      .filter((n) => /^\d+$/.test(n))
      .sort((a, b) => Number(a) - Number(b));
  } catch {
    return [];
  }
}

/** Copies the View as it is now to a new checkpoint. Does nothing if it has no code yet. */
export function saveCheckpoint(viewId: string) {
  if (!hasCode(viewId)) return false;
  const names = checkpointNames(viewId);
  const last = names.length ? Number(names[names.length - 1]) : 0;
  const name = String(Math.max(Date.now(), last + 1));
  writeBundle(path.join(checkpointDirFor(viewId), name), readBundle(viewDirFor(viewId)));
  for (const old of names.slice(0, Math.max(0, names.length + 1 - MAX_CHECKPOINTS))) {
    fs.rmSync(path.join(checkpointDirFor(viewId), old), { recursive: true, force: true });
  }
  return true;
}

export function hasCheckpoint(viewId: string) {
  return checkpointNames(viewId).length > 0;
}

/**
 * Restores the newest checkpoint and removes it, so reverting again steps further back.
 * Anything the user allowed only for the code being replaced is withdrawn with it.
 */
export function revertView(viewId: string) {
  const names = checkpointNames(viewId);
  if (!names.length) throw new Error(`View "${viewId}" has no earlier version to revert to.`);
  const dir = path.join(checkpointDirFor(viewId), names[names.length - 1]);
  const revision = readBundle(dir);
  writeBundle(viewDirFor(viewId), revision);
  fs.rmSync(dir, { recursive: true, force: true });
  narrowApprovalToCurrent(viewId);
  notifyViewsChanged([viewId], true);
  return revisionOf(revision.files['View.jsx'] || '');
}

/** Deletes the View's folder and its checkpoints. */
export function deleteViewFiles(viewId: string) {
  ownWrites.set(viewId, Date.now());
  fs.rmSync(viewDirFor(viewId), { recursive: true, force: true });
  fs.rmSync(checkpointDirFor(viewId), { recursive: true, force: true });
}
