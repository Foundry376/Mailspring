import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  writeView,
  createUnbuiltView,
  readViewBundle,
  saveCheckpoint,
  hasCheckpoint,
  revertView,
  currentRevisionOf,
  revisionOf,
  validateRevision,
} from '../lib/authoring/revisions';
import {
  ViewDiagnostics,
  RENDER_OK_QUIET_MS,
  summarizeParams,
  authorStack,
  locationOf,
  reportFromGuest,
} from '../lib/authoring/diagnostics';
import { allViews, ViewRegistryEvents } from '../lib/view-registry';
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

  describe('revisions', function () {
    const v = (source: string) => ({ manifest: { name: source }, files: { 'View.jsx': source } });
    const viewFile = () =>
      fs.readFileSync(path.join(configDir, 'views', 'spec-view', 'View.jsx'), 'utf8');

    it('writes a revision as the View itself', function () {
      const revision = writeView('spec-view', VIEW);
      const view = allViews().find((x) => x.id === 'spec-view');
      expect(view.source).toBe('user');
      expect(view.name).toBe('Spec View');
      expect(currentRevisionOf('spec-view')).toBe(revision);
    });

    it('reverts to checkpoints newest first', function () {
      writeView('spec-view', v('one'));
      saveCheckpoint('spec-view');
      writeView('spec-view', v('two'));
      saveCheckpoint('spec-view');
      writeView('spec-view', v('three'));

      expect(revertView('spec-view')).toBe(revisionOf('two'));
      expect(viewFile()).toBe('two');
      expect(revertView('spec-view')).toBe(revisionOf('one'));
      expect(viewFile()).toBe('one');
      expect(hasCheckpoint('spec-view')).toBe(false);
      expect(() => revertView('spec-view')).toThrow();
    });

    it('keeps no checkpoint for a View that does not exist yet', function () {
      expect(saveCheckpoint('spec-view')).toBe(false);
      expect(hasCheckpoint('spec-view')).toBe(false);
    });

    it('creates an unbuilt View that has a card but no code to send or checkpoint', function () {
      createUnbuiltView('spec-view', 'Spec View');
      const view = allViews().find((x) => x.id === 'spec-view');
      expect(view.name).toBe('Spec View');
      expect(view.built).toBe(false);
      expect(view.permissions).toEqual([]);
      expect(readViewBundle('spec-view')).toBe(null);
      expect(currentRevisionOf('spec-view')).toBe(null);
      expect(saveCheckpoint('spec-view')).toBe(false);

      writeView('spec-view', VIEW);
      expect(allViews().find((x) => x.id === 'spec-view').built).toBe(true);
      expect(readViewBundle('spec-view').files['View.jsx']).toBe(VIEW.files['View.jsx']);
    });

    it('keeps only the newest ten checkpoints', function () {
      writeView('spec-view', v('0'));
      for (let i = 1; i <= 12; i++) {
        saveCheckpoint('spec-view');
        writeView('spec-view', v(String(i)));
      }
      expect(fs.readdirSync(path.join(configDir, 'views-checkpoints', 'spec-view')).length).toBe(
        10
      );
      expect(revertView('spec-view')).toBe(revisionOf('11'));
    });

    it('reports changes as structural so the sidebar re-registers', function () {
      const changes = [];
      const listener = (c) => changes.push(c);
      ViewRegistryEvents.on('changed', listener);
      writeView('spec-view', VIEW);
      ViewRegistryEvents.removeListener('changed', listener);
      expect(changes).toEqual([{ viewIds: ['spec-view'], structural: true }]);
    });

    it('hashes View.jsx the same way the main process does', function () {
      // view-sessions.ts: sha256 hex, first 12 characters.
      expect(revisionOf('abc')).toBe('ba7816bf8f01');
      expect(writeView('spec-view', VIEW)).toBe(revisionOf(VIEW.files['View.jsx']));
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
      const broken = 'export default () => (\n';
      const revision = writeView('diag', {
        manifest: { name: 'Diag' },
        files: { 'View.jsx': broken },
      });
      reportFromGuest('diag', { kind: 'page', revision: 'old' });
      ViewDiagnostics.add({ viewId: 'diag', kind: 'crash', message: 'gone' });
      const pending = ViewDiagnostics.waitForOutcome('diag', revision, 1000);
      reportFromGuest('diag', { kind: 'page', revision });
      reportFromGuest('diag', { kind: 'compile-error', message: 'made up by the page' });
      const outcome = await pending;
      expect(outcome.status).toBe('failed');
      expect(outcome.diagnostics.map((d) => d.kind)).toEqual(['compile-error']);
      expect(outcome.diagnostics[0].message).not.toContain('made up');
      expect(outcome.diagnostics[0].untrusted).toBeFalsy();
    });

    it('ignores compile errors reported for a View that compiles', function () {
      writeView('diag', VIEW);
      reportFromGuest('diag', { kind: 'compile-error', message: 'Subject: private' });
      expect(ViewDiagnostics.get('diag')).toEqual([]);
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
