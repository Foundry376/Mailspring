import { z } from 'zod';
import { addAuditEntry } from '../../../mcp-server/lib/capabilities/audit';
import {
  FetchInit,
  credentialedFetch,
  declaredCredential,
  isConnected,
} from '../credentials/store';
import { requestCredential } from '../credentials/credential-sheet';
import { ViewError, ViewErrorCode } from './errors';
import { Handler, parse } from './handlers';

/**
 * Bridge methods for View credentials (views-api.md §3.10). None of them return a secret:
 * `credentials.fetch` sends the request from the main process and returns the scrubbed
 * response, `credentials.status` says whether a key is stored, and `ui.requestCredential`
 * opens the host's Connect sheet.
 */

const CredentialId = z.string().min(1).max(32);

const FetchParams = z.object({
  credentialId: CredentialId,
  url: z.string().url().max(8192),
  init: z
    .object({
      method: z.string().max(10).optional(),
      headers: z.record(z.string(), z.string().max(8192)).optional(),
      body: z.string().nullable().optional(),
    })
    .optional(),
});

const ERROR_CODES: { [code: string]: ViewErrorCode } = {
  permission: 'permission',
  not_connected: 'not_connected',
  invalid: 'invalid',
  limit: 'limit',
  timeout: 'timeout',
};

// The audit log records what was asked of which host, never query strings (which can carry
// tokens or mail content) and never the secret.
function auditTarget(url: string) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return '(invalid url)';
  }
}

export const CREDENTIAL_HANDLERS: { [method: string]: Handler } = {
  'credentials.status': async ({ viewId }, params) => {
    const { credentialId } = parse(z.object({ credentialId: CredentialId }), params);
    if (!declaredCredential(viewId, credentialId)) {
      throw new ViewError('permission', `This View's manifest doesn't declare "${credentialId}".`);
    }
    return { connected: await isConnected(viewId, credentialId) };
  },

  'credentials.fetch': async ({ viewId }, params) => {
    const { credentialId, url, init = {} } = parse(FetchParams, params);
    if (init.headers && Object.keys(init.headers).length > 50) {
      throw new ViewError('limit', 'Requests are limited to 50 headers.');
    }
    const start = Date.now();
    const method = (init.method || 'GET').toUpperCase();
    const { result, error } = await credentialedFetch(viewId, credentialId, url, init as FetchInit);
    addAuditEntry({
      source: `view:${viewId}`,
      toolName: `credentialFetch(${credentialId})`,
      params: `${method} ${auditTarget(url)}`,
      resultSummary: error ? `error: ${error.code}` : `${result.status}`,
      durationMs: Date.now() - start,
    });
    if (error) {
      throw new ViewError(ERROR_CODES[error.code] || 'unavailable', error.message);
    }
    if (result.redacted) {
      console.warn(
        `Views: a response to "${viewId}" contained its "${credentialId}" credential and was redacted.`
      );
    }
    return result;
  },

  'ui.requestCredential': async ({ viewId }, params) => {
    const { credentialId } = parse(z.object({ credentialId: CredentialId }), params);
    if (!declaredCredential(viewId, credentialId)) {
      throw new ViewError('permission', `This View's manifest doesn't declare "${credentialId}".`);
    }
    return { connected: await requestCredential(viewId, credentialId) };
  },
};
