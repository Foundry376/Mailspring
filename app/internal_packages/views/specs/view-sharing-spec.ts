import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { nativeImage } from 'electron';
import { IdentityStore } from 'mailspring-exports';
import { checkSignature } from '../lib/agent/signing';
import { keypair } from './view-signing-helpers';
import { AgentAPIError } from '../lib/agent/types';
import { allViews } from '../lib/view-registry';
import { writeView } from '../lib/authoring/revisions';
import { LIGHT_THEME_TOKENS } from '../lib/theme-tokens';
import { MockSource } from '../lib/mock/mock-bridge';
import { expandMockData } from '../lib/mock/mock-data';
import { isShareId, shareIdFromInstallURL, webURL } from '../lib/sharing/share-link';
import { ShareClient, ShareTransport, parseBundle, parseSharedInfo } from '../lib/sharing/client';
import {
  publishView,
  sha256Hex,
  shareErrorMessage,
  shareTextProblem,
  shareableRevision,
} from '../lib/sharing/publish';
import { installSharedView, installedFromShare } from '../lib/sharing/install';
import { POSTER_SIZES, cropToPoster, posterPlan } from '../lib/sharing/posters';
import { currentShare } from '../lib/sharing/share-sheet';

const SHARE_ID = 'aB3dE5gH7j';
const VIEW_CODE = 'export default () => null;\n';
const MOCK = '{"threads":[]}\n';

const BUNDLE = {
  manifest: { name: 'Payroll runs', placement: 'page', permissions: ['mail.bodies'] },
  files: { 'View.jsx': VIEW_CODE, 'mock-data.json': MOCK },
};

function stubTransport(overrides: Partial<ShareTransport> = {}): ShareTransport {
  return {
    publish: jasmine.createSpy('publish').andCallFake(async () => ({
      shareId: SHARE_ID,
      url: `https://getmailspring.com/v/${SHARE_ID}`,
    })),
    remove: jasmine.createSpy('remove').andCallFake(async () => {}),
    listShares: jasmine.createSpy('listShares').andCallFake(async () => []),
    getShared: jasmine.createSpy('getShared'),
    install: jasmine.createSpy('install'),
    ...overrides,
  } as ShareTransport;
}

describe('Views sharing: signatures', function () {
  it('accepts a bundle signed over its manifest and files', function () {
    const k = keypair();
    expect(checkSignature(BUNDLE, k.sign(BUNDLE), k.publicKey).ok).toBe(true);
  });

  it('rejects tampered files or manifests, unsigned bundles and other keys', function () {
    const k = keypair();
    const signature = k.sign(BUNDLE);
    const tamperedFiles = { ...BUNDLE, files: { 'View.jsx': 'fetch("https://evil")' } };
    const tamperedManifest = { ...BUNDLE, manifest: { ...BUNDLE.manifest, network: ['evil.com'] } };
    expect(checkSignature(tamperedFiles, signature, k.publicKey).ok).toBe(false);
    expect(checkSignature(tamperedManifest, signature, k.publicKey).ok).toBe(false);
    expect(checkSignature(BUNDLE, undefined, k.publicKey).ok).toBe(false);
    expect(checkSignature(BUNDLE, signature, null).ok).toBe(false);
    expect(checkSignature(BUNDLE, signature, keypair().publicKey).ok).toBe(false);
    expect(checkSignature(BUNDLE, 'not-base64!!', k.publicKey).ok).toBe(false);
  });
});

describe('Views sharing: install links', function () {
  it('reads the share id from a well-formed install link', function () {
    expect(shareIdFromInstallURL(`mailspring://install-view?share=${SHARE_ID}`)).toBe(SHARE_ID);
  });

  it('refuses other hosts, schemes, malformed ids and ambiguous links', function () {
    [
      `mailspring://open-inbox?share=${SHARE_ID}`,
      `https://install-view?share=${SHARE_ID}`,
      `mailspring://install-view?share=${SHARE_ID}&share=zZ3dE5gH7j`,
      'mailspring://install-view?share=short',
      'mailspring://install-view?share=../../etc/x',
      `mailspring://install-view?share=${SHARE_ID}%2F..`,
      'mailspring://install-view',
      'not a url',
    ].forEach((url) => expect(shareIdFromInstallURL(url)).toBe(null));
    expect(isShareId('aB3dE5gH7j1')).toBe(false);
  });

  it('only treats http(s) addresses as web links', function () {
    expect(webURL('https://getmailspring.com/v/x')).toBe('https://getmailspring.com/v/x');
    expect(webURL('javascript:alert(1)')).toBe(null);
    expect(webURL('file:///etc/passwd')).toBe(null);
    expect(webURL(3)).toBe(null);
  });
});

describe('Views sharing: server replies', function () {
  it("filters a share's permissions and hosts like a manifest", function () {
    const info = parseSharedInfo(
      {
        shareId: SHARE_ID,
        name: 'Payroll',
        description: 'Totals',
        permissions: ['mail.bodies', 'root.everything'],
        network: ['API.Example.com', 'localhost', 'not a host', 42],
        posterURL: 'javascript:alert(1)',
      },
      SHARE_ID
    );
    expect(info.permissions).toEqual(['mail.bodies']);
    expect(info.network).toEqual(['api.example.com']);
    expect(info.posterURL).toBe(null);
  });

  it('rejects metadata or bundles for a different share', function () {
    expect(() => parseSharedInfo({ shareId: 'zZ3dE5gH7j', name: 'x' }, SHARE_ID)).toThrow();
    expect(() =>
      parseBundle({ shareId: 'zZ3dE5gH7j', manifest: {}, files: {}, signature: 's' }, SHARE_ID)
    ).toThrow();
    expect(() => parseBundle({ shareId: SHARE_ID, manifest: [], files: {} }, SHARE_ID)).toThrow();
  });
});

describe('Views sharing: ShareClient', function () {
  let requests: { url: string; init: RequestInit }[];

  beforeEach(function () {
    requests = [];
    spyOn(IdentityStore, 'identity').andReturn({ id: 'id-1', token: 'tok' } as any);
    spyOn(window, 'fetch').andCallFake(async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (url.includes('/install')) {
        return new Response(
          JSON.stringify({ error: { code: 'quota', message: 'No builds', plan: 'free' } }),
          { status: 429 }
        );
      }
      return new Response(
        JSON.stringify({ shareId: SHARE_ID, name: 'Payroll', permissions: [], network: [] }),
        { status: 200 }
      );
    });
  });

  const client = () => new ShareClient(() => 'https://id.test');

  it('reads public metadata without credentials', async function () {
    const info = await client().getShared(SHARE_ID);
    expect(info.name).toBe('Payroll');
    expect(requests[0].url).toBe(`https://id.test/api/views/shared/${SHARE_ID}`);
    expect((requests[0].init.headers as Headers).get('Authorization')).toBe(null);
  });

  it('refuses a malformed share id before any request', async function () {
    let error: any = null;
    try {
      await client().install('../agent/sessions');
    } catch (err) {
      error = err;
    }
    expect(error && error.code).toBe('invalid_share');
    expect(requests.length).toBe(0);
  });

  it('installs and removes with the identity token and surfaces quota errors', async function () {
    let error: any = null;
    try {
      await client().install(SHARE_ID);
    } catch (err) {
      error = err;
    }
    expect(error instanceof AgentAPIError).toBe(true);
    expect(error.code).toBe('quota');
    expect(error.details.plan).toBe('free');
    expect(requests[0].init.method).toBe('POST');
    expect((requests[0].init.headers as Headers).get('Authorization')).toBe(
      `Basic ${btoa('tok:')}`
    );

    await client().remove(SHARE_ID);
    expect(requests[1].url).toBe(`https://id.test/api/views/share/${SHARE_ID}`);
    expect(requests[1].init.method).toBe('DELETE');
  });
});

describe('Views sharing: publish and install', function () {
  let configDir: string;
  let config: { [key: string]: any };

  beforeEach(function () {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'views-sharing-'));
    spyOn(AppEnv, 'getConfigDirPath').andReturn(configDir);
    spyOn(AppEnv, 'inDevMode').andReturn(false);
    config = {};
    spyOn(AppEnv.config, 'get').andCallFake((key) => config[key]);
    spyOn(AppEnv.config, 'set').andCallFake((key, value) => (config[key] = value));
  });

  afterEach(function () {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  const viewNamed = (id: string) => allViews().find((v) => v.id === id);

  describe('shareableRevision', function () {
    it('needs a built user View with an accepted agent revision', function () {
      writeView('payroll-abc123', BUNDLE);
      const view = viewNamed('payroll-abc123');
      expect(shareableRevision(view, 7)).toBe(7);
      expect(shareableRevision(view, 0)).toBe(0);
      expect(shareableRevision({ ...view, source: 'example' }, 7)).toBe(0);
      expect(shareableRevision({ ...view, built: false }, 7)).toBe(0);
      expect(shareableRevision(null, 7)).toBe(0);
    });
  });

  describe('shareTextProblem', function () {
    it('requires a name of up to 60 characters and a description of up to 500', function () {
      expect(shareTextProblem('Payroll', '')).toBe(null);
      expect(shareTextProblem('  ', '')).not.toBe(null);
      expect(shareTextProblem('x'.repeat(61), '')).not.toBe(null);
      expect(shareTextProblem('Payroll', 'x'.repeat(501))).not.toBe(null);
    });
  });

  describe('publishView', function () {
    const posters = { og: 'b2c=', card: 'Y2FyZA==' };

    it('sends hashes of the installed files and saves the public name and description', async function () {
      writeView('payroll-abc123', BUNDLE);
      const transport = stubTransport();
      const published = await publishView({
        viewId: 'payroll-abc123',
        revision: 7,
        name: '  Payroll runs this year ',
        description: 'Every run.',
        posters,
        transport,
      });
      expect(published.shareId).toBe(SHARE_ID);
      const body = (transport.publish as jasmine.Spy).mostRecentCall.args[0];
      expect(body).toEqual({
        viewId: 'payroll-abc123',
        revision: 7,
        sha256: { 'View.jsx': sha256Hex(VIEW_CODE), 'mock-data.json': sha256Hex(MOCK) },
        name: 'Payroll runs this year',
        description: 'Every run.',
        posters,
      });
      expect(body.sha256['View.jsx']).toBe(
        crypto.createHash('sha256').update(VIEW_CODE).digest('hex')
      );
      const view = viewNamed('payroll-abc123');
      expect(view.name).toBe('Payroll runs this year');
      expect(view.json.description).toBe('Every run.');
    });

    it("doesn't change the View when the backend refuses it", async function () {
      writeView('payroll-abc123', BUNDLE);
      const transport = stubTransport({
        publish: async () => {
          throw new AgentAPIError('Changed', { statusCode: 409, code: 'not_agent_revision' });
        },
      });
      let error: any = null;
      try {
        await publishView({
          viewId: 'payroll-abc123',
          revision: 7,
          name: 'Renamed',
          description: '',
          posters,
          transport,
        });
      } catch (err) {
        error = err;
      }
      expect(error.code).toBe('not_agent_revision');
      expect(viewNamed('payroll-abc123').name).toBe('Payroll runs');
    });

    it('refuses a View without mock data before contacting the server', async function () {
      writeView('payroll-abc123', { ...BUNDLE, files: { 'View.jsx': VIEW_CODE } });
      const transport = stubTransport();
      let error: any = null;
      try {
        await publishView({
          viewId: 'payroll-abc123',
          revision: 7,
          name: 'Payroll',
          description: '',
          posters,
          transport,
        });
      } catch (err) {
        error = err;
      }
      expect(error.code).toBe('no_mock_data');
      expect(transport.publish).not.toHaveBeenCalled();
    });

    it('explains the provenance refusals', function () {
      ['no_session', 'not_agent_revision', 'no_mock_data'].forEach((code) =>
        expect(shareErrorMessage(new AgentAPIError('raw', { code }))).not.toBe('raw')
      );
      expect(shareErrorMessage(new AgentAPIError('Offline', { code: 'offline' }))).toBe('Offline');
    });
  });

  describe('installSharedView', function () {
    function signedBundle(k = keypair(), bundle: any = BUNDLE) {
      return {
        shareId: SHARE_ID,
        ...bundle,
        signature: k.sign(bundle),
      };
    }

    it('writes a verified share under a new id that records where it came from', async function () {
      const k = keypair();
      const manifest = {
        ...BUNDLE.manifest,
        id: 'sharers-view-id',
        starter: { id: 'kanban' },
        shared: { shareId: 'other00000' },
      };
      const transport = stubTransport({
        install: async () => signedBundle(k, { ...BUNDLE, manifest }),
      });
      const viewId = await installSharedView({
        shareId: SHARE_ID,
        transport,
        publicKey: k.publicKey,
      });
      expect(viewId.startsWith('payroll-runs-')).toBe(true);
      const view = viewNamed(viewId);
      expect(view.json.id).toBe(viewId);
      expect(view.json.shared).toEqual({ shareId: SHARE_ID });
      expect(view.json.starter).toBeUndefined();
      expect(view.permissions).toEqual(['mail.bodies']);
      expect(fs.readFileSync(path.join(view.dir, 'View.jsx'), 'utf8')).toBe(VIEW_CODE);
      expect(installedFromShare(SHARE_ID).map((v) => v.id)).toEqual([viewId]);
      // Installed Views aren't agent-built here, so they can't be shared on until edited.
      expect(shareableRevision(view, 0)).toBe(0);
      // Nothing is approved: the consent card asks on first run.
      expect(config['core.views.approvals']).toBeUndefined();
    });

    it('writes nothing when the signature or files are wrong', async function () {
      const k = keypair();
      const forged = {
        ...signedBundle(k),
        files: { 'View.jsx': 'evil()', 'mock-data.json': MOCK },
      };
      const badName = signedBundle(k, { ...BUNDLE, files: { ...BUNDLE.files, '../x.js': 'x' } });
      for (const bundle of [forged, badName]) {
        let error: any = null;
        try {
          await installSharedView({
            shareId: SHARE_ID,
            transport: stubTransport({ install: async () => bundle }),
            publicKey: k.publicKey,
          });
        } catch (err) {
          error = err;
        }
        expect(error).not.toBe(null);
      }
      let unpinned: any = null;
      try {
        await installSharedView({
          shareId: SHARE_ID,
          transport: stubTransport({ install: async () => signedBundle(k) }),
          publicKey: null,
        });
      } catch (err) {
        unpinned = err;
      }
      expect(unpinned.code).toBe('bad_signature');
      expect(allViews().length).toBe(0);
    });

    it('validates the share id before asking the server', async function () {
      const transport = stubTransport();
      let error: any = null;
      try {
        await installSharedView({ shareId: 'nope', transport, publicKey: keypair().publicKey });
      } catch (err) {
        error = err;
      }
      expect(error.code).toBe('invalid_share');
      expect(transport.install).not.toHaveBeenCalled();
    });
  });
});

describe('Views sharing: share sheet', function () {
  it('opens on the share for the current revision, else the newest', function () {
    const share = (shareId: string, revision: number, createdAt: string, viewId = 'v-1') => ({
      shareId,
      url: `https://getmailspring.com/v/${shareId}`,
      viewId,
      revision,
      name: 'x',
      createdAt,
    });
    const shares = [
      share('aaaaaaaaa1', 3, '2026-01-01'),
      share('aaaaaaaaa2', 5, '2026-03-01'),
      share('aaaaaaaaa3', 4, '2026-02-01'),
      share('aaaaaaaaa4', 9, '2026-09-01', 'other'),
    ];
    expect(currentShare(shares, 'v-1', 3).shareId).toBe('aaaaaaaaa1');
    expect(currentShare(shares, 'v-1', 8).shareId).toBe('aaaaaaaaa2');
    expect(currentShare(shares, 'v-2', 1)).toBe(null);
  });
});

describe('Views sharing: posters', function () {
  it('renders once at a size both poster shapes can be cut from', function () {
    const ratio = (s: { width: number; height: number }) => s.width / s.height;
    for (const placement of ['page', 'thread-sidebar'] as const) {
      const plan = posterPlan(placement);
      expect(ratio(plan.og)).toBeCloseTo(ratio(POSTER_SIZES.og), 2);
      expect(ratio(plan.card)).toBeCloseTo(ratio(POSTER_SIZES.card), 2);
      expect(plan.render.height).toBe(plan.og.height);
    }
    expect(posterPlan('page').render).toEqual(posterPlan('page').og);
    expect(posterPlan('thread-sidebar').render.width).toBe(300);
  });

  it('produces PNGs of exactly the share sizes from a capture at any device scale', function () {
    const plan = posterPlan('page');
    for (const scale of [1, 2]) {
      const canvas = document.createElement('canvas');
      canvas.width = plan.render.width * scale;
      canvas.height = plan.render.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#2f6fdf';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const capture = nativeImage.createFromDataURL(canvas.toDataURL('image/png'));
      for (const key of ['og', 'card'] as const) {
        const png = cropToPoster(
          capture,
          plan.render.width,
          { x: 0, y: 0, ...plan[key] },
          POSTER_SIZES[key]
        );
        expect(png.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(nativeImage.createFromBuffer(png).getSize()).toEqual(POSTER_SIZES[key]);
      }
    }
  });

  it('gives a mock render a fixed light theme when asked', function () {
    const data = expandMockData({ threads: [] });
    const light = new MockSource('v-1', [], data, LIGHT_THEME_TOKENS).handlers();
    expect(light['theme.get'](null, {})).toBe(LIGHT_THEME_TOKENS);
    expect(LIGHT_THEME_TOKENS.mode).toBe('light');
  });
});
