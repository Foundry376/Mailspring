import { localized } from 'mailspring-exports';
import { ViewManifest, allViews } from '../view-registry';
import { writeView } from '../authoring/revisions';
import { checkSignature } from '../agent/signing';
import { newViewId } from '../agent/store';
import { AgentAPIError } from '../agent/types';
import { ShareTransport } from './client';
import { isShareId } from './share-link';

// Provenance the sharer's copy may carry; the installed copy records its own instead.
const PROVENANCE_KEYS = ['id', 'starter', 'shared'];

/** Installed Views that came from `shareId`, so the install sheet can offer the copy already here. */
export function installedFromShare(shareId: string): ViewManifest[] {
  return allViews().filter(
    (v) => v.source === 'user' && v.json && v.json.shared && v.json.shared.shareId === shareId
  );
}

/**
 * Installs a share: asks the backend for its signed bundle (which reserves a build the first
 * time this account installs it), checks the signature against the pinned key, and writes it
 * under a new id with `manifest.shared = { shareId }`. Returns the new View's id. The View's
 * permissions and hosts aren't approved here; its consent card asks when it first runs.
 */
export async function installSharedView({
  shareId,
  transport,
  publicKey,
}: {
  shareId: string;
  transport: ShareTransport;
  publicKey: string | null;
}): Promise<string> {
  if (!isShareId(shareId)) {
    throw new AgentAPIError(localized('This link to a shared View isn’t valid.'), {
      code: 'invalid_share',
    });
  }
  const bundle = await transport.install(shareId);
  const check = checkSignature(bundle, bundle.signature, publicKey);
  if (check.ok === false) {
    throw new AgentAPIError(
      localized(
        'This shared View couldn’t be verified, so it wasn’t installed. (%@)',
        check.reason
      ),
      { code: 'bad_signature' }
    );
  }

  const manifest = { ...bundle.manifest };
  PROVENANCE_KEYS.forEach((key) => delete manifest[key]);
  const name = typeof manifest.name === 'string' ? manifest.name.trim().slice(0, 60) : '';
  manifest.name = name || localized('Shared View');
  const viewId = newViewId(manifest.name);
  const revision = {
    manifest: { ...manifest, id: viewId, shared: { shareId } },
    files: bundle.files,
  };
  // writeView applies the same checks as every revision (file names, sizes, a View.jsx);
  // readManifest normalizes placement and permissions when the registry loads it.
  writeView(viewId, revision);
  return viewId;
}
