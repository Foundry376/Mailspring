/* eslint global-require: 0 */
import { APIError } from './errors';

// A 0 code is when an error returns without a status code, like "ESOCKETTIMEDOUT"
export const TimeoutErrorCodes = [
  0,
  408,
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
];
export const PermanentErrorCodes = [
  400,
  401,
  402,
  403,
  404,
  405,
  429,
  500,
  'ENOTFOUND',
  'ECONNREFUSED',
  'EHOSTDOWN',
  'EHOSTUNREACH',
];
export const CanceledErrorCodes = [-123, 'ECONNABORTED'];
export const SampleTemporaryErrorCode = 504;

let IdentityStore = null;

// server option

export function rootURLForServer(server: 'identity') {
  const env = AppEnv.config.get('env');

  if (!['development', 'staging', 'production'].includes(env)) {
    throw new Error(`rootURLForServer: ${env} is not a valid environment.`);
  }

  if (server === 'identity') {
    return {
      development: 'http://localhost:5101',
      staging: 'https://id-staging.getmailspring.com',
      production: 'https://id.getmailspring.com',
    }[env];
  }
  throw new Error('rootURLForServer: You must provide a valid `server` value');
}

export async function postStaticAsset({
  filename,
  blob,
}: {
  filename: string;
  blob: string | Blob;
}) {
  const body = new FormData();
  body.set('filename', filename);
  if (typeof blob === 'string') {
    body.set('file', new Blob([blob], { type: 'text/plain' }), filename);
  } else {
    body.set('file', blob, filename);
  }
  const resp = await makeRequest({
    server: 'identity',
    method: 'POST',
    path: `/api/save-public-asset`,
    body: body,
  });
  return resp.link;
}

export async function postStaticPage({ html, key }: { html: string; key: string }) {
  const json = await makeRequest({
    server: 'identity',
    method: 'POST',
    path: '/api/share-static-page',
    json: true,
    body: { key, html },
    timeout: 1500,
  });
  return json.link;
}

export async function makeRequest({
  body,
  path,
  server,
  ...rest
}: {
  server: 'identity'; // future-proofing
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: { [key: string]: any };
  timeout?: number;
  json?: true;
}) {
  // for some reason when `fetch` completes, the stack trace has been lost.
  // In case the request failsm capture the stack now.
  const root = rootURLForServer(server);
  const url = `${root}${path}`;

  IdentityStore = IdentityStore || require('./stores/identity-store').IdentityStore;
  const identity = IdentityStore.identity();
  if (!identity) {
    throw new Error('makeRequest: A Mailspring identity is required.');
  }

  const init: RequestInit = { ...rest };
  init.headers = new Headers();
  init.headers.set('Accept', 'application/json');
  init.credentials = 'include';
  init.headers.set('Authorization', `Basic ${btoa(`${IdentityStore.identity().token}:`)}`);

  if (body) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(body);
    }
  }

  const desc = `${init.method || 'GET'} ${url}`;
  const error = new APIError(`${desc} failed`);
  let resp = null;
  try {
    resp = await fetch(url, init);
  } catch (uselessFetchError) {
    // TypeError: Failed to fetch when user is offline, with no stack trace.
    throw error;
  }
  if (!resp.ok) {
    error.statusCode = resp.status;
    error.message = `${desc} returned ${resp.status} ${resp.statusText}`;
    throw error;
  }
  try {
    return resp.json();
  } catch (invalidJSONError) {
    // We need to wrap this generic JSON error into our APIError class to attach the request
    // description and also to prevent it from being reported to Sentry 7,000 times a month.
    error.message = `${desc} returned invalid JSON: ${invalidJSONError.toString()}`;
    throw error;
  }
}

export default {
  TimeoutErrorCodes,
  PermanentErrorCodes,
  CanceledErrorCodes,
  SampleTemporaryErrorCode,
  rootURLForServer,
  makeRequest,
  postStaticPage,
  postStaticAsset,
};
