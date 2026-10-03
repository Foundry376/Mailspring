import { ipcRenderer } from 'electron';
import { KeyManager } from 'mailspring-exports';
import { CREDENTIAL_HANDLERS } from '../lib/bridge/credentials';
import { BridgeContext } from '../lib/bridge/handlers';
import { FULL_GRANT } from '../../mcp-server/lib/capabilities/grant';
import { getAuditLog, clearAuditLog } from '../../mcp-server/lib/capabilities/audit';
import * as registry from '../lib/view-registry';
import * as credentialStore from '../lib/credentials/store';
import { mismatchedService } from '../lib/credentials/credential-sheet';
import {
  credentialBinding,
  credentialsFromManifest,
} from '../../../src/browser/view-credential-policy';

const SECRET = 'ghp_s3cretT0kenValue1234567890';

const manifests: { [id: string]: any } = {
  alpha: {
    network: ['api.github.com'],
    credentials: [{ id: 'github', label: 'GitHub token', hosts: ['api.github.com'] }],
  },
  beta: { network: ['api.github.com'] },
};

const ctx = (viewId: string): BridgeContext => ({
  viewId,
  grant: { viewId, namespace: `view:${viewId}`, permissions: new Set(), scope: FULL_GRANT },
  emit: () => {},
});

async function errorFrom(fn: () => any) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('Expected the call to fail');
}

describe('View credentials', () => {
  let keys: { [key: string]: string };

  beforeEach(() => {
    keys = {};
    spyOn(registry, 'installedViews').andCallFake(() =>
      Object.keys(manifests).map((id) => ({
        id,
        name: id,
        placement: 'page',
        permissions: [],
        dir: `/views/${id}`,
        source: 'installed',
        json: manifests[id],
      }))
    );
    spyOn(KeyManager, 'getPassword').andCallFake(async (k: string) => keys[k]);
    spyOn(KeyManager, 'replacePassword').andCallFake(async (k: string, v: string) => {
      keys[k] = v;
    });
    spyOn(KeyManager, 'deletePassword').andCallFake(async (k: string) => {
      delete keys[k];
    });
    spyOn(KeyManager, 'deletePasswordsWithPrefix').andCallFake(async (prefix: string) => {
      Object.keys(keys)
        .filter((k) => k.startsWith(prefix))
        .forEach((k) => delete keys[k]);
    });
    spyOn(ipcRenderer, 'invoke').andCallFake(async (channel: string, req: any) => ({
      result: {
        status: 200,
        statusText: 'OK',
        url: req.url,
        redirected: false,
        headers: { 'content-type': 'application/json' },
        body: '{"login":"octocat"}',
        bodyEncoding: 'utf8',
        redacted: false,
      },
    }));
    clearAuditLog('view:alpha');
  });

  afterEach(async () => {
    await credentialStore.removeAllCredentials('alpha');
    await credentialStore.removeAllCredentials('beta');
  });

  it('reports a declared credential as not connected until a key is stored', async () => {
    const before = await CREDENTIAL_HANDLERS['credentials.status'](ctx('alpha'), {
      credentialId: 'github',
    });
    expect(before).toEqual({ connected: false });
    await credentialStore.saveCredential('alpha', 'github', SECRET);
    const after = await CREDENTIAL_HANDLERS['credentials.status'](ctx('alpha'), {
      credentialId: 'github',
    });
    expect(after).toEqual({ connected: true });
  });

  it("refuses credentials a View's manifest doesn't declare, including another View's", async () => {
    await credentialStore.saveCredential('alpha', 'github', SECRET);
    const err = await errorFrom(() =>
      CREDENTIAL_HANDLERS['credentials.fetch'](ctx('beta'), {
        credentialId: 'github',
        url: 'https://api.github.com/user',
      })
    );
    expect(err.code).toBe('permission');
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    expect(KeyManager.getPassword).not.toHaveBeenCalledWith('view-credential:beta:github');
  });

  it('refuses to fetch until the user connects the credential', async () => {
    const err = await errorFrom(() =>
      CREDENTIAL_HANDLERS['credentials.fetch'](ctx('alpha'), {
        credentialId: 'github',
        url: 'https://api.github.com/user',
      })
    );
    expect(err.code).toBe('not_connected');
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  it('treats a key stored for a different binding as not connected', async () => {
    keys['view-credential:alpha:github'] = JSON.stringify({ secret: SECRET, binding: 'stale' });
    const status = await CREDENTIAL_HANDLERS['credentials.status'](ctx('alpha'), {
      credentialId: 'github',
    });
    expect(status).toEqual({ connected: false });
  });

  it('sends the secret only to the main process and never returns it to the View', async () => {
    await credentialStore.saveCredential('alpha', 'github', SECRET);
    const result = await CREDENTIAL_HANDLERS['credentials.fetch'](ctx('alpha'), {
      credentialId: 'github',
      url: 'https://api.github.com/user?access_token=leak',
      init: { method: 'GET' },
    });
    const [channel, request] = (ipcRenderer.invoke as any).mostRecentCall.args;
    expect(channel).toBe('mailspring-view:credential-fetch');
    expect(request.secret).toBe(SECRET);
    expect(request.binding).toBe(credentialBinding(credentialsFromManifest(manifests.alpha)[0]));
    expect(JSON.stringify(result).includes(SECRET)).toBe(false);
    expect(result.body).toBe('{"login":"octocat"}');

    // The audit log names the host and path, never the query string or the secret.
    const [entry] = getAuditLog('view:alpha');
    expect(entry.params).toBe('GET api.github.com/user');
    expect(JSON.stringify(entry).includes('leak')).toBe(false);
    expect(JSON.stringify(entry).includes(SECRET)).toBe(false);
  });

  it('maps main-process refusals to ViewErrors', async () => {
    await credentialStore.saveCredential('alpha', 'github', SECRET);
    (ipcRenderer.invoke as any).andCallFake(async () => ({
      error: { code: 'permission', message: 'only https to api.github.com' },
    }));
    const err = await errorFrom(() =>
      CREDENTIAL_HANDLERS['credentials.fetch'](ctx('alpha'), {
        credentialId: 'github',
        url: 'http://api.github.com/user',
      })
    );
    expect(err.code).toBe('permission');
  });

  it('removes every credential of a View when the View is removed', async () => {
    await credentialStore.saveCredential('alpha', 'github', SECRET);
    await credentialStore.removeAllCredentials('alpha');
    expect(Object.keys(keys)).toEqual([]);
    expect(await credentialStore.isConnected('alpha', 'github')).toBe(false);
  });

  it('flags labels that claim a well-known service bound to other hosts', () => {
    const [phish] = credentialsFromManifest({
      network: ['collect.example.com'],
      credentials: [{ id: 'github', label: 'GitHub token', hosts: ['collect.example.com'] }],
    });
    expect(mismatchedService(phish)).toBe('github');
    expect(mismatchedService(credentialsFromManifest(manifests.alpha)[0])).toBe(null);
  });
});
