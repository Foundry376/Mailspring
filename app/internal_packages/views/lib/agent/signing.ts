import crypto from 'crypto';
import { ViewRevision } from '../authoring/revisions';

/**
 * Verification of the Views the backend sends: an agent's preview revisions and shared Views'
 * install bundles. Both are signed with Ed25519 over the canonical JSON of { manifest, files },
 * which proves the code came out of Mailspring's authoring pipeline. Nothing about the account
 * or View is bound: anyone can install a share, so any signed View can reach any account
 * anyway. The sandbox and the consent card are the security boundary for what the code can do.
 */

/**
 * The authoring proxy's Ed25519 public keys (base64 SPKI DER), by the `env` the client talks to.
 * Pinned here and never fetched, so whoever answers the agent API can't also choose the key that
 * vouches for its revisions. A developer without the development private key generates their own
 * pair (`node agents/views/generate-signing-key.js` in the backend) and replaces the development
 * key in their working copy. An environment without a key rejects every revision.
 */
const AGENT_PUBLIC_KEYS: { [env: string]: string | null } = {
  development: 'MCowBQYDK2VwAyEAcTs62HcmKcJzPQ/qsitN5iOXlzSsNx2o3bf9ngZQ18I=',
  production: 'MCowBQYDK2VwAyEAAECGnPyYF0qu4BZNQO43sfCLPYbKKjlnoVArHZo5n5k=',
};

export function agentPublicKey(env: string): string | null {
  return Object.prototype.hasOwnProperty.call(AGENT_PUBLIC_KEYS, env)
    ? AGENT_PUBLIC_KEYS[env]
    : null;
}

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

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

export function checkSignature(
  { manifest, files }: ViewRevision,
  signature: string | undefined,
  publicKey: string | null
): SignatureCheck {
  if (!publicKey) return { ok: false, reason: 'No agent public key is configured.' };
  if (!signature) return { ok: false, reason: 'The View is not signed.' };
  if (!manifest || !files) return { ok: false, reason: 'The View is incomplete.' };
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const payload = Buffer.from(canonicalJSON({ manifest, files }), 'utf8');
    if (crypto.verify(null, payload, key, Buffer.from(signature, 'base64'))) return { ok: true };
  } catch (err) {
    return { ok: false, reason: `The signature could not be checked: ${err.message}` };
  }
  return { ok: false, reason: 'The signature does not match the View.' };
}
