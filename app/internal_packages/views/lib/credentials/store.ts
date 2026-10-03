import { ipcRenderer } from 'electron';
import { KeyManager } from 'mailspring-exports';
import {
  ViewCredential,
  credentialBinding,
  credentialsFromManifest,
} from '../../../../src/browser/view-credential-policy';
import { installedViews } from '../view-registry';

/**
 * Host-side storage for View credentials. Secrets live in the system keychain through
 * KeyManager, under `view-credential:<viewId>:<credentialId>`, alongside the binding (hosts,
 * header, format) they were entered for. Nothing here is reachable from a View: the bridge only
 * exposes `credentials.status`, `credentials.fetch` and `ui.requestCredential`, none of which
 * return the secret.
 */

const CREDENTIAL_FETCH_CHANNEL = 'mailspring-view:credential-fetch';

interface StoredCredential {
  secret: string;
  binding: string;
}

const keyName = (viewId: string, credentialId: string) =>
  `view-credential:${viewId}:${credentialId}`;

// Decrypting the keyset prompts the keychain on some platforms, so records are cached for the
// session. Writes go through this module and keep the cache current.
const cache = new Map<string, StoredCredential | null>();

export function declaredCredentials(viewId: string): ViewCredential[] {
  const view = installedViews().find((v) => v.id === viewId);
  return view ? credentialsFromManifest(view.json) : [];
}

export function declaredCredential(viewId: string, credentialId: string) {
  return declaredCredentials(viewId).find((c) => c.id === credentialId) || null;
}

async function storedCredential(viewId: string, credentialId: string) {
  const key = keyName(viewId, credentialId);
  if (!cache.has(key)) {
    const raw = await KeyManager.getPassword(key);
    let record: StoredCredential | null = null;
    try {
      record = raw ? JSON.parse(raw) : null;
    } catch {
      record = null;
    }
    cache.set(key, record);
  }
  return cache.get(key);
}

/**
 * The stored record if it still applies to the credential as the manifest now declares it.
 * A record entered for other hosts or another header is treated as absent.
 */
async function applicableCredential(viewId: string, credential: ViewCredential) {
  const record = await storedCredential(viewId, credential.id);
  if (!record || record.binding !== credentialBinding(credential)) return null;
  return record;
}

export async function isConnected(viewId: string, credentialId: string) {
  const credential = declaredCredential(viewId, credentialId);
  return !!credential && !!(await applicableCredential(viewId, credential));
}

export async function saveCredential(viewId: string, credentialId: string, secret: string) {
  const credential = declaredCredential(viewId, credentialId);
  if (!credential) throw new Error(`This View doesn't declare "${credentialId}".`);
  const record: StoredCredential = { secret, binding: credentialBinding(credential) };
  await KeyManager.replacePassword(keyName(viewId, credentialId), JSON.stringify(record));
  cache.set(keyName(viewId, credentialId), record);
}

export async function removeCredential(viewId: string, credentialId: string) {
  await KeyManager.deletePassword(keyName(viewId, credentialId));
  cache.set(keyName(viewId, credentialId), null);
}

/** Deletes every credential stored for the View. Called when the View is removed. */
export async function removeAllCredentials(viewId: string) {
  await KeyManager.deletePasswordsWithPrefix(`view-credential:${viewId}:`);
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`view-credential:${viewId}:`)) cache.delete(key);
  }
}

export interface FetchInit {
  method?: string;
  headers?: { [name: string]: string };
  body?: string | null;
}

/**
 * Runs a credentialed request through the main process. Returns `{ error }` rather than throwing
 * so the bridge handler can map codes to ViewErrors.
 */
export async function credentialedFetch(
  viewId: string,
  credentialId: string,
  url: string,
  init: FetchInit
) {
  const credential = declaredCredential(viewId, credentialId);
  if (!credential) {
    return {
      error: { code: 'permission', message: `This View doesn't declare "${credentialId}".` },
    };
  }
  const record = await applicableCredential(viewId, credential);
  if (!record) {
    return {
      error: {
        code: 'not_connected',
        message: `"${credential.label}" isn't connected. Call ui.requestCredential('${credentialId}').`,
      },
    };
  }
  return ipcRenderer.invoke(CREDENTIAL_FETCH_CHANNEL, {
    viewId,
    credentialId,
    secret: record.secret,
    binding: record.binding,
    url,
    init,
  });
}
