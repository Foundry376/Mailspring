import { IpcMain, net, session } from 'electron';
import {
  ViewCredential,
  RateLimiter,
  credentialBinding,
  credentialsFromManifest,
  headerValue,
  isCredentialURLAllowed,
  isDeniedHeader,
  isTextualContentType,
  scrubBuffer,
  scrubString,
  secretVariants,
} from './view-credential-policy';
import { PARTITION_PREFIX, viewIdForPartition } from './view-sandbox-policy';

/**
 * Performs a View's credentialed requests (`credentials.fetch`) in the main process.
 *
 * The host window decrypts the secret from the keychain and sends it here with the View's
 * request. The View itself never holds the secret: its process has no access to the keychain
 * or to this channel, and every response is scrubbed for the secret before it is returned.
 * The binding (hosts, header, format) is re-read from the View's manifest on disk rather than
 * trusted from the caller, and must match what the secret was stored for.
 */

export const CREDENTIAL_FETCH_CHANNEL = 'mailspring-view:credential-fetch';

const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const MAX_REDIRECTS = 5;
const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Response headers that carry state the View has no use for and that could hold the secret's
// session equivalents.
const DROPPED_RESPONSE_HEADERS = ['set-cookie', 'set-cookie2'];

const limiter = new RateLimiter(60, 20);

export interface CredentialFetchRequest {
  viewId: string;
  credentialId: string;
  secret: string;
  binding: string;
  url: string;
  init?: { method?: string; headers?: { [name: string]: string }; body?: string | null };
}

export interface CredentialFetchResponse {
  status: number;
  statusText: string;
  url: string;
  redirected: boolean;
  headers: { [name: string]: string };
  body: string;
  bodyEncoding: 'utf8' | 'base64';
  /** Set when the response contained the secret and was redacted before returning. */
  redacted: boolean;
  /** Set when a redirect left the credential's hosts and was not followed. */
  blockedRedirect?: string;
}

class CredentialFetchError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// No cookies, cache or auth state shared with any other session, and nothing persisted.
function credentialSession() {
  return session.fromPartition('mailspring-view-credentials', { cache: false });
}

function requestHeaders(request: CredentialFetchRequest, credential: ViewCredential) {
  const headers: { [name: string]: string } = {};
  const supplied = (request.init && request.init.headers) || {};
  for (const [name, value] of Object.entries(supplied)) {
    if (typeof value !== 'string' || /[\r\n\0]/.test(value) || /[\r\n\0]/.test(name)) continue;
    if (name.toLowerCase() === credential.header.toLowerCase()) continue;
    if (isDeniedHeader(name) && name.toLowerCase() !== 'content-type') continue;
    headers[name] = value;
  }
  headers[credential.header] = headerValue(credential, request.secret);
  return headers;
}

function flattenHeaders(raw: { [name: string]: string | string[] }) {
  const headers: { [name: string]: string } = {};
  for (const [name, value] of Object.entries(raw || {})) {
    const lower = name.toLowerCase();
    if (DROPPED_RESPONSE_HEADERS.includes(lower)) continue;
    headers[lower] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return headers;
}

function scrubHeaders(headers: { [name: string]: string }, variants: string[]) {
  let found = false;
  const out: { [name: string]: string } = {};
  for (const [name, value] of Object.entries(headers)) {
    const scrubbed = scrubString(value, variants);
    found = found || scrubbed.found;
    out[name] = scrubbed.value;
  }
  return { headers: out, found };
}

function perform(
  request: CredentialFetchRequest,
  credential: ViewCredential
): Promise<CredentialFetchResponse> {
  const method = ((request.init && request.init.method) || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.includes(method)) {
    throw new CredentialFetchError('invalid', `${method} requests aren't supported.`);
  }
  const body = request.init && typeof request.init.body === 'string' ? request.init.body : null;
  if (body && Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) {
    throw new CredentialFetchError('limit', 'Request bodies are limited to 1 MB.');
  }
  const variants = secretVariants(credential, request.secret);

  return new Promise((resolve, reject) => {
    let redirects = 0;
    let currentURL = request.url;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const req = net.request({
      method,
      url: request.url,
      session: credentialSession(),
      redirect: 'manual',
      useSessionCookies: false,
      credentials: 'omit',
    } as any);
    for (const [name, value] of Object.entries(requestHeaders(request, credential))) {
      req.setHeader(name, value);
    }

    const timer = setTimeout(() => {
      req.abort();
      finish(() => reject(new CredentialFetchError('timeout', 'The request timed out.')));
    }, REQUEST_TIMEOUT_MS);

    req.on('redirect', (statusCode, _method, redirectUrl, responseHeaders) => {
      redirects += 1;
      if (redirects <= MAX_REDIRECTS && isCredentialURLAllowed(redirectUrl, credential)) {
        currentURL = redirectUrl;
        req.followRedirect();
        return;
      }
      // Leaving the bound hosts: stop here and hand back the redirect itself, so the secret is
      // never sent anywhere the user didn't approve.
      req.abort();
      const { headers, found } = scrubHeaders(flattenHeaders(responseHeaders as any), variants);
      finish(() =>
        resolve({
          status: statusCode,
          statusText: '',
          url: currentURL,
          redirected: redirects > 1,
          headers,
          body: '',
          bodyEncoding: 'utf8',
          redacted: found,
          blockedRedirect: scrubString(redirectUrl, variants).value,
        })
      );
    });

    req.on('response', (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.abort();
          finish(() => reject(new CredentialFetchError('limit', 'Responses are limited to 5 MB.')));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const rawHeaders = flattenHeaders(response.headers as any);
        const scrubbedHeaders = scrubHeaders(rawHeaders, variants);
        const scrubbedBody = scrubBuffer(Buffer.concat(chunks), variants);
        const textual = isTextualContentType(rawHeaders['content-type']);
        finish(() =>
          resolve({
            status: response.statusCode,
            statusText: response.statusMessage || '',
            url: currentURL,
            redirected: redirects > 0,
            headers: scrubbedHeaders.headers,
            body: scrubbedBody.body.toString(textual ? 'utf8' : 'base64'),
            bodyEncoding: textual ? 'utf8' : 'base64',
            redacted: scrubbedHeaders.found || scrubbedBody.found,
          })
        );
      });
      response.on('error', (err: Error) =>
        finish(() => reject(new CredentialFetchError('network', err.message)))
      );
    });

    req.on('error', (err) =>
      finish(() => reject(new CredentialFetchError('network', err.message)))
    );
    if (body) req.write(body);
    req.end();
  });
}

function validate(request: any, readManifest: (viewId: string) => any): ViewCredential {
  if (!request || typeof request !== 'object') {
    throw new CredentialFetchError('invalid', 'Malformed request.');
  }
  const { viewId, credentialId, secret, binding, url } = request;
  if (typeof viewId !== 'string' || !viewIdForPartition(`${PARTITION_PREFIX}${viewId}`)) {
    throw new CredentialFetchError('invalid', 'Invalid view id.');
  }
  if (typeof secret !== 'string' || !secret || typeof binding !== 'string') {
    throw new CredentialFetchError('not_connected', 'No secret is stored for this credential.');
  }
  const credential = credentialsFromManifest(readManifest(viewId)).find(
    (c) => c.id === credentialId
  );
  if (!credential) {
    throw new CredentialFetchError('permission', `This View doesn't declare "${credentialId}".`);
  }
  if (credentialBinding(credential) !== binding) {
    throw new CredentialFetchError(
      'not_connected',
      'The credential was stored for different hosts or headers. Connect it again.'
    );
  }
  if (typeof url !== 'string' || !isCredentialURLAllowed(url, credential)) {
    throw new CredentialFetchError(
      'permission',
      `"${credentialId}" can only be sent over https to ${credential.hosts.join(', ')}.`
    );
  }
  if (!limiter.take(viewId)) {
    throw new CredentialFetchError('limit', 'Too many credentialed requests. Slow down.');
  }
  return credential;
}

/**
 * Registered with the other View IPC handlers. Only the host window may call it: a View guest
 * runs in its own session with no ipcRenderer, and is refused here regardless.
 */
export function registerViewCredentialIPCHandlers(
  ipcMain: IpcMain,
  readManifest: (viewId: string) => any,
  isViewSender: (sender: Electron.WebContents) => boolean
) {
  ipcMain.handle(CREDENTIAL_FETCH_CHANNEL, async (event, request: CredentialFetchRequest) => {
    if (isViewSender(event.sender) || event.sender.getType() === 'webview') {
      return { error: { code: 'permission', message: 'Not permitted.' } };
    }
    try {
      const credential = validate(request, readManifest);
      return { result: await perform(request, credential) };
    } catch (err) {
      return { error: { code: err.code || 'network', message: err.message } };
    }
  });
}
