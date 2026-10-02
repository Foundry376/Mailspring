import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  writeDraft,
  promoteDraft,
  discardDraft,
  hasDraft,
  revisionOf,
  validateRevision,
} from '../lib/authoring/drafts';
import {
  ViewDiagnostics,
  RENDER_OK_QUIET_MS,
  summarizeParams,
  authorStack,
  locationOf,
  reportFromGuest,
} from '../lib/authoring/diagnostics';
import { installedViews, ViewRegistryEvents } from '../lib/view-registry';
import { ViewBridge } from '../lib/view-bridge';

const VIEW = {
  manifest: { name: 'Spec View' },
  files: { 'View.jsx': 'export default () => null;\n' },
};

describe('View authoring', function () {
  let configDir: string;

  beforeEach(function () {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'views-authoring-'));
    spyOn(AppEnv, 'getConfigDirPath').andReturn(configDir);
    spyOn(AppEnv, 'inDevMode').andReturn(false);
  });

  afterEach(function () {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  describe('drafts', function () {
    it('previews a draft over the installed copy without touching it', function () {
      const installed = path.join(configDir, 'views', 'spec-view');
      fs.mkdirSync(installed, { recursive: true });
      fs.writeFileSync(path.join(installed, 'manifest.json'), '{"name":"Installed"}');
      fs.writeFileSync(path.join(installed, 'View.jsx'), 'old');

      writeDraft('spec-view', VIEW);
      const view = installedViews().find((v) => v.id === 'spec-view');
      expect(view.source).toBe('draft');
      expect(view.name).toBe('Spec View');
      expect(fs.readFileSync(path.join(installed, 'View.jsx'), 'utf8')).toBe('old');

      discardDraft('spec-view');
      const after = installedViews().find((v) => v.id === 'spec-view');
      expect(after.source).toBe('installed');
      expect(after.name).toBe('Installed');
    });

    it('promotes a draft to the installed copy', function () {
      const revision = writeDraft('spec-view', VIEW);
      expect(promoteDraft('spec-view')).toBe(revision);
      expect(hasDraft('spec-view')).toBe(false);
      const installed = path.join(configDir, 'views', 'spec-view', 'View.jsx');
      expect(fs.readFileSync(installed, 'utf8')).toBe(VIEW.files['View.jsx']);
    });

    it('reports draft changes as structural so the sidebar re-registers', function () {
      const changes = [];
      const listener = (c) => changes.push(c);
      ViewRegistryEvents.on('changed', listener);
      writeDraft('spec-view', VIEW);
      ViewRegistryEvents.removeListener('changed', listener);
      expect(changes).toEqual([{ viewIds: ['spec-view'], structural: true }]);
    });

    it('hashes View.jsx the same way the main process does', function () {
      // view-sessions.ts: sha256 hex, first 12 characters.
      expect(revisionOf('abc')).toBe('ba7816bf8f01');
      expect(writeDraft('spec-view', VIEW)).toBe(revisionOf(VIEW.files['View.jsx']));
    });

    it('refuses bad ids, file names and missing View.jsx', function () {
      expect(() => validateRevision('Bad_ID', VIEW)).toThrow();
      expect(() => validateRevision('ok', { manifest: {}, files: {} })).toThrow();
      expect(() =>
        validateRevision('ok', { manifest: {}, files: { ...VIEW.files, '../x.js': '' } })
      ).toThrow();
      expect(() =>
        validateRevision('ok', { manifest: {}, files: { ...VIEW.files, 'manifest.json': '' } })
      ).toThrow();
    });
  });

  describe('diagnostics', function () {
    beforeEach(function () {
      ViewDiagnostics.clear('diag');
    });

    it('records render-ok after a quiet period, tagged with the page revision', function () {
      reportFromGuest('diag', { kind: 'page', revision: 'abc123' });
      reportFromGuest('diag', { kind: 'mounted' });
      advanceClock(RENDER_OK_QUIET_MS + 1);
      const records = ViewDiagnostics.get('diag');
      expect(records.map((r) => r.kind)).toEqual(['render-ok']);
      expect(records[0].revision).toBe('abc123');
    });

    it('withholds render-ok when the View fails during the quiet period', function () {
      reportFromGuest('diag', { kind: 'page', revision: 'abc123' });
      reportFromGuest('diag', { kind: 'mounted' });
      reportFromGuest('diag', {
        kind: 'runtime-error',
        message: 'x is undefined',
        stack: 'at View (mailspring-view://diag/view.js:12:5)',
      });
      advanceClock(RENDER_OK_QUIET_MS + 1);
      const records = ViewDiagnostics.get('diag');
      expect(records.map((r) => r.kind)).toEqual(['runtime-error']);
      expect(records[0].stack).toContain('View.jsx:12:5');
      expect(records[0].location).toEqual({ line: 12, column: 5 });
      expect(records[0].untrusted).toBe(true);
    });

    it('reads compile error positions from Sucrase messages', function () {
      expect(locationOf('View.jsx: Unexpected token (7:12)')).toEqual({ line: 7, column: 12 });
    });

    it('settles waitForOutcome on the revision it was asked about', async function () {
      reportFromGuest('diag', { kind: 'page', revision: 'old' });
      ViewDiagnostics.add({ viewId: 'diag', kind: 'crash', message: 'gone' });
      const pending = ViewDiagnostics.waitForOutcome('diag', 'new', 1000);
      reportFromGuest('diag', { kind: 'page', revision: 'new' });
      reportFromGuest('diag', { kind: 'compile-error', message: 'View.jsx: bad (1:2)' });
      const outcome = await pending;
      expect(outcome.status).toBe('failed');
      expect(outcome.diagnostics.map((d) => d.kind)).toEqual(['compile-error']);
    });

    it('ignores guest reports of kinds only the host may record', function () {
      reportFromGuest('diag', { kind: 'render-ok', message: 'trust me' });
      reportFromGuest('diag', { kind: 'crash', message: 'fake' });
      expect(ViewDiagnostics.get('diag')).toEqual([]);
    });

    it('summarizes bridge params as names and types, never values', function () {
      const summary = summarizeParams({ query: { search: 'from:boss@example.com' }, ids: ['a'] });
      expect(summary).toBe('{ query: object, ids: array(1) }');
      expect(summary).not.toContain('boss');
    });

    it('points stack frames at View.jsx', function () {
      expect(authorStack('at f (mailspring-view://v/view.js:3:9)')).toBe('at f (View.jsx:3:9)');
    });
  });

  describe('bridge page lifecycle', function () {
    function fakeWebview() {
      const listeners = {};
      return {
        sent: [],
        addEventListener: (name, fn) => (listeners[name] = fn),
        removeEventListener: () => {},
        send(channel, payload) {
          this.sent.push({ channel, payload });
        },
        hello(page) {
          return listeners['ipc-message']({ channel: 'mailspring-view:hello', args: [{ page }] });
        },
        deliver(args, page = 'p1') {
          return listeners['ipc-message']({
            channel: 'mailspring-view:call',
            args: [{ page, ...args }],
          });
        },
      } as any;
    }

    it('lets a reloaded page reuse subscription ids', async function () {
      const webview = fakeWebview();
      const bridge = new ViewBridge('spec', webview, {});
      spyOn(bridge as any, 'observableFor').andReturn({
        subscribe: () => ({ dispose: () => {} }),
      });
      webview.hello('p1');
      await webview.deliver({
        id: 1,
        method: 'subscribe',
        params: { subId: 's1', kind: 'threads' },
      });
      bridge.resetPage();
      webview.hello('p2');
      await webview.deliver(
        {
          id: 1,
          method: 'subscribe',
          params: { subId: 's1', kind: 'threads' },
        },
        'p2'
      );
      const replies = webview.sent.filter((s) => s.channel === 'mailspring-view:reply');
      expect(replies.map((r) => r.payload.error)).toEqual([undefined, undefined]);
      bridge.dispose();
    });

    it('drops replies to calls the previous page made', async function () {
      const webview = fakeWebview();
      let release: () => void;
      const bridge = new ViewBridge('spec', webview, {
        handlers: { slow: () => new Promise<void>((resolve) => (release = resolve)) },
      });
      webview.hello('p1');
      const call = webview.deliver({ id: 7, method: 'slow', params: {} });
      bridge.resetPage();
      release();
      await call;
      expect(webview.sent.filter((s) => s.channel === 'mailspring-view:reply')).toEqual([]);
      bridge.dispose();
    });

    it('ignores calls from a page other than the one that said hello', async function () {
      const webview = fakeWebview();
      const bridge = new ViewBridge('spec', webview, { handlers: { ping: () => 'pong' } });
      webview.hello('p1');
      bridge.resetPage();
      // The old page sends a call after the reset but before the new page loads.
      await webview.deliver({ id: 1, method: 'ping', params: {} }, 'p1');
      webview.hello('p2');
      await webview.deliver({ id: 1, method: 'ping', params: {} }, 'p1');
      await webview.deliver({ id: 1, method: 'ping', params: {} }, 'p2');
      const replies = webview.sent.filter((s) => s.channel === 'mailspring-view:reply');
      expect(replies.map((r) => r.payload)).toEqual([{ page: 'p2', id: 1, result: 'pong' }]);
      bridge.dispose();
    });

    it('drops the previous page state when a new page says hello', async function () {
      const webview = fakeWebview();
      const bridge = new ViewBridge('spec', webview, {});
      const dispose = jasmine.createSpy('dispose');
      spyOn(bridge as any, 'observableFor').andReturn({ subscribe: () => ({ dispose }) });
      webview.hello('p1');
      await webview.deliver({
        id: 1,
        method: 'subscribe',
        params: { subId: 's1', kind: 'threads' },
      });
      // A reload the host didn't see start (no resetPage) still clears the old page.
      webview.hello('p2');
      expect(dispose).toHaveBeenCalled();
      bridge.dispose();
    });
  });
});
