import crypto from 'crypto';
import { localized } from 'mailspring-exports';
import { ViewManifest } from '../view-registry';
import { compatibility } from '../api-version';
import { readViewBundle, writeView } from '../authoring/revisions';
import { MOCK_DATA_FILE } from '../mock/mock-data';
import { AgentAPIError } from '../agent/types';
import { PublishedShare, ShareTransport } from './client';

export const MAX_NAME_CHARS = 60;
export const MAX_DESCRIPTION_CHARS = 500;
// The backend refuses a revision whose hashes differ from its copy of these files, so the share
// is the code the user is looking at. The manifest isn't hashed: the user may rename the View.
const HASHED_FILES = ['View.jsx', MOCK_DATA_FILE];

/**
 * The agent revision a View would be shared as, or 0 when it can't be shared: dev examples,
 * Views with no code yet, Views this build won't run (no one else could either), and anything
 * the agent didn't build here (starters, Views installed from a share, hand-written ones) until
 * the agent edits them.
 */
export function shareableRevision(view: ViewManifest | null, agentRevision: number) {
  if (!view || view.source !== 'user' || !view.built) return 0;
  if (compatibility(view.apiVersion) !== 'ok') return 0;
  return agentRevision > 0 ? agentRevision : 0;
}

export function hasMockData(viewId: string) {
  const bundle = readViewBundle(viewId);
  return !!bundle && typeof bundle.files[MOCK_DATA_FILE] === 'string';
}

/** What's wrong with the public name and description, or null when they can be published. */
export function shareTextProblem(name: string, description: string): string | null {
  const n = name.trim();
  if (!n) return localized('Give the View a name.');
  if (n.length > MAX_NAME_CHARS) {
    return localized('Names can be up to %@ characters.', MAX_NAME_CHARS);
  }
  if (description.trim().length > MAX_DESCRIPTION_CHARS) {
    return localized('Descriptions can be up to %@ characters.', MAX_DESCRIPTION_CHARS);
  }
  return null;
}

export function sha256Hex(content: string) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Publishes the View's agent revision `revision` and saves the public name and description to
 * the installed manifest, so the View is called what its link says.
 */
export async function publishView({
  viewId,
  revision,
  name,
  description,
  posters,
  transport,
}: {
  viewId: string;
  revision: number;
  name: string;
  description: string;
  posters: { og: string; card: string };
  transport: ShareTransport;
}): Promise<PublishedShare> {
  const bundle = readViewBundle(viewId);
  if (!bundle) throw new Error(localized('This View has no code to share yet.'));
  if (typeof bundle.files[MOCK_DATA_FILE] !== 'string') {
    throw new AgentAPIError(noMockDataMessage(), { code: 'no_mock_data' });
  }
  const sha256: { [file: string]: string } = {};
  for (const file of HASHED_FILES) sha256[file] = sha256Hex(bundle.files[file]);

  const publicName = name.trim();
  const publicDescription = description.trim();
  const published = await transport.publish({
    viewId,
    revision,
    sha256,
    name: publicName,
    description: publicDescription,
    posters,
  });

  const { manifest } = bundle;
  if (manifest.name !== publicName || (manifest.description || '') !== publicDescription) {
    const next = { ...manifest, name: publicName, description: publicDescription };
    if (!publicDescription) delete next.description;
    writeView(viewId, { manifest: next, files: bundle.files });
  }
  return published;
}

export function noMockDataMessage() {
  return localized(
    'Shared Views are previewed with invented sample data, and this View doesn’t have any yet. Ask the agent to add mock data, then share again.'
  );
}

/** A readable reason a publish, lookup or removal failed. */
export function shareErrorMessage(err: any): string {
  const code = err instanceof AgentAPIError ? err.code : null;
  if (code === 'no_session') {
    return localized(
      'Only Views built with the agent on this account can be shared. Ask the agent to make a change, then share again.'
    );
  }
  if (code === 'not_agent_revision') {
    return localized(
      'This View has changed since the agent last worked on it, so it doesn’t match a version the agent built. Ask the agent to make a change, then share again.'
    );
  }
  if (code === 'no_mock_data') return noMockDataMessage();
  return (err && err.message) || localized('Something went wrong.');
}

export function mockDataRequest() {
  return localized(
    'I’d like to share this View. Please add a mock-data.json with invented sample data, so it can be previewed without my mail.'
  );
}
