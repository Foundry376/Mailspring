import crypto from 'crypto';
import { ViewRevision } from '../authoring/drafts';

/**
 * Verification of `preview_revision` payloads signed by the authoring proxy (see
 * docs/plans/views-agent-protocol.md, "Signing preview_revision"). The signature proves a
 * revision came from Mailspring's backend for this account and View; the sandbox and the
 * consent sheet remain the security boundary for what the code can do.
 */

/** JSON with object keys sorted recursively and no whitespace, as the backend signs it. */
export function canonicalJSON(value: any): string {
  if (value === null || typeof value !== 'object') {
    // undefined has no JSON form; the backend never signs one, so treat it as null.
    return value === undefined ? 'null' : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : canonicalJSON(v))).join(',')}]`;
  }
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
}

export interface SignedRevision extends ViewRevision {
  revision: number;
}

export type RevisionCheck = { ok: true } | { ok: false; reason: string };

/**
 * Checks one revision against the pinned key, this account and View, and the last revision
 * accepted for the View (replays and rollbacks are refused).
 */
export function checkSignedRevision({
  input,
  signature,
  publicKey,
  identityId,
  viewId,
  lastAcceptedRevision,
}: {
  input: SignedRevision;
  signature: string | undefined;
  publicKey: string | null;
  identityId: string;
  viewId: string;
  lastAcceptedRevision: number;
}): RevisionCheck {
  if (!publicKey) return { ok: false, reason: 'No agent public key is configured.' };
  if (!signature) return { ok: false, reason: 'The revision is not signed.' };
  if (!input || !Number.isInteger(input.revision) || input.revision < 1) {
    return { ok: false, reason: 'The revision number is missing or invalid.' };
  }
  const payload = canonicalJSON({
    identityId,
    viewId,
    revision: input.revision,
    manifest: input.manifest,
    files: input.files,
  });
  let valid = false;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    valid = crypto.verify(
      null,
      Buffer.from(payload, 'utf8'),
      key,
      Buffer.from(signature, 'base64')
    );
  } catch (err) {
    return { ok: false, reason: `The signature could not be checked: ${err.message}` };
  }
  // Binding identityId and viewId into the signed payload means a valid signature for another
  // account or View fails here rather than needing a separate comparison.
  if (!valid) return { ok: false, reason: 'The signature does not match this account and View.' };
  if (input.revision <= lastAcceptedRevision) {
    return {
      ok: false,
      reason: `Revision ${input.revision} is not newer than revision ${lastAcceptedRevision}.`,
    };
  }
  return { ok: true };
}
