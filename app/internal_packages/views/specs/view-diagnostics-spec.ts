import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeView, revisionOf } from '../lib/authoring/revisions';
import {
  Diagnostic,
  ViewDiagnostics,
  RENDER_OK_QUIET_MS,
  isFailure,
  locationOf,
  reportFromGuest,
} from '../lib/authoring/diagnostics';
import { relayableDiagnostics, summarizeOutcome } from '../lib/agent/tools';

const VIEW_ID = 'diag-spec';

const record = (fields: Partial<Diagnostic>): Diagnostic => ({
  ts: 1,
  viewId: VIEW_ID,
  revision: 'r',
  kind: 'render-ok',
  message: '',
  ...fields,
});

describe('View diagnostics', function () {
  let configDir: string;

  beforeEach(function () {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'views-diagnostics-'));
    spyOn(AppEnv, 'getConfigDirPath').andReturn(configDir);
    spyOn(AppEnv, 'inDevMode').andReturn(false);
    ViewDiagnostics.clear(VIEW_ID);
    ViewDiagnostics.pageLoaded(VIEW_ID, null);
  });

  afterEach(function () {
    ViewDiagnostics.clear(VIEW_ID);
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  describe('recording', function () {
    it('caps message and stack length and coerces a missing message', function () {
      const long = ViewDiagnostics.add({
        viewId: VIEW_ID,
        kind: 'bridge-error',
        message: 'x'.repeat(5000),
        stack: 'y'.repeat(9000),
      });
      expect(long.message.length).toBe(1001);
      expect(long.stack.length).toBe(4001);

      const empty = ViewDiagnostics.add({ viewId: VIEW_ID, kind: 'crash', message: undefined });
      expect(empty.message).toBe('');
    });

    it('keeps only the newest 200 records per View', function () {
      for (let i = 0; i < 205; i++) {
        ViewDiagnostics.add({ viewId: VIEW_ID, kind: 'bridge-error', message: `m${i}` });
      }
      const records = ViewDiagnostics.get(VIEW_ID);
      expect(records.length).toBe(200);
      expect(records[0].message).toBe('m5');
      expect(records[199].message).toBe('m204');
    });

    it('tags records with the page revision unless one is given', function () {
      ViewDiagnostics.pageLoaded(VIEW_ID, 'page-rev');
      const implicit = ViewDiagnostics.add({ viewId: VIEW_ID, kind: 'crash', message: 'a' });
      const explicit = ViewDiagnostics.add({
        viewId: VIEW_ID,
        kind: 'consent',
        message: 'b',
        revision: 'other',
      });
      expect(implicit.revision).toBe('page-rev');
      expect(explicit.revision).toBe('other');
      expect(ViewDiagnostics.get(VIEW_ID, { revision: 'other' }).map((d) => d.kind)).toEqual([
        'consent',
      ]);
    });

    it('locates compile and runtime errors, preferring the message over the stack', function () {
      expect(locationOf('Unexpected token (3:4)', 'at View.jsx:9:9')).toEqual({
        line: 3,
        column: 4,
      });
      expect(locationOf('boom', 'at View.jsx:9:2')).toEqual({ line: 9, column: 2 });
      expect(locationOf('boom', 'at <runtime>/react.js:9:2')).toBe(undefined);

      const stack = 'at View (View.jsx:5:6)';
      const runtime = ViewDiagnostics.add({
        viewId: VIEW_ID,
        kind: 'runtime-error',
        message: 'a',
        stack,
      });
      const rejection = ViewDiagnostics.add({
        viewId: VIEW_ID,
        kind: 'unhandled-rejection',
        message: 'a',
        stack,
      });
      const given = ViewDiagnostics.add({
        viewId: VIEW_ID,
        kind: 'runtime-error',
        message: 'a',
        stack,
        location: { line: 1, column: 1 },
      });
      expect(runtime.location).toEqual({ line: 5, column: 6 });
      expect(rejection.location).toBe(undefined);
      expect(given.location).toEqual({ line: 1, column: 1 });
    });

    it('counts only errors that stop a revision from working as failures', function () {
      const kinds = [
        'compile-error',
        'runtime-error',
        'unhandled-rejection',
        'crash',
        'hang',
        'bridge-error',
        'consent',
        'render-ok',
      ] as Diagnostic['kind'][];
      expect(kinds.filter((kind) => isFailure(record({ kind })))).toEqual([
        'compile-error',
        'runtime-error',
        'unhandled-rejection',
        'crash',
        'hang',
      ]);
    });
  });

  describe('render-ok', function () {
    const mountPage = (revision: string) => {
      reportFromGuest(VIEW_ID, { kind: 'page', revision });
      reportFromGuest(VIEW_ID, { kind: 'mounted' });
    };

    it('is not recorded when a new page loads during the quiet period', function () {
      mountPage('one');
      advanceClock(RENDER_OK_QUIET_MS / 2);
      reportFromGuest(VIEW_ID, { kind: 'page', revision: 'two' });
      advanceClock(RENDER_OK_QUIET_MS);
      expect(ViewDiagnostics.get(VIEW_ID)).toEqual([]);
    });

    it('restarts the quiet period when the View mounts again', function () {
      mountPage('one');
      advanceClock(RENDER_OK_QUIET_MS - 100);
      reportFromGuest(VIEW_ID, { kind: 'mounted' });
      advanceClock(200);
      expect(ViewDiagnostics.get(VIEW_ID)).toEqual([]);
      advanceClock(RENDER_OK_QUIET_MS);
      expect(ViewDiagnostics.get(VIEW_ID).map((d) => d.kind)).toEqual(['render-ok']);
    });

    it('is still recorded after bridge errors', function () {
      mountPage('one');
      ViewDiagnostics.add({ viewId: VIEW_ID, kind: 'bridge-error', message: 'x' });
      advanceClock(RENDER_OK_QUIET_MS + 1);
      expect(ViewDiagnostics.get(VIEW_ID).map((d) => d.kind)).toEqual([
        'bridge-error',
        'render-ok',
      ]);
    });

    it('is not recorded when a failure arrives during the quiet period', function () {
      mountPage('one');
      reportFromGuest(VIEW_ID, { kind: 'runtime-error', message: 'boom' });
      advanceClock(RENDER_OK_QUIET_MS + 1);
      expect(ViewDiagnostics.get(VIEW_ID).map((d) => d.kind)).toEqual(['runtime-error']);
    });

    it('emits mounted so thumbnails can capture a first render', function () {
      const mounted = jasmine.createSpy('mounted');
      ViewDiagnostics.on('mounted', mounted);
      reportFromGuest(VIEW_ID, { kind: 'mounted' });
      ViewDiagnostics.removeListener('mounted', mounted);
      expect(mounted).toHaveBeenCalledWith(VIEW_ID);
    });
  });

  describe('guest reports', function () {
    it('treats a page without a string revision as having none', function () {
      reportFromGuest(VIEW_ID, { kind: 'page', revision: 42 });
      expect(ViewDiagnostics.revisionFor(VIEW_ID)).toBe(null);
    });

    it('records unhandled rejections, keeping only a string stack', function () {
      reportFromGuest(VIEW_ID, { kind: 'unhandled-rejection', message: 'nope', stack: { a: 1 } });
      const [d] = ViewDiagnostics.get(VIEW_ID);
      expect(d.kind).toBe('unhandled-rejection');
      expect(d.stack).toBe(undefined);
    });

    it('ignores malformed and unknown reports', function () {
      reportFromGuest(VIEW_ID, null);
      reportFromGuest(VIEW_ID, { kind: 'bridge-error', message: 'x' });
      reportFromGuest(VIEW_ID, { kind: 'console', message: 'x' });
      reportFromGuest('no-such-view', { kind: 'compile-error' });
      expect(ViewDiagnostics.get(VIEW_ID)).toEqual([]);
      expect(ViewDiagnostics.get('no-such-view')).toEqual([]);
    });

    it("records Sucrase's error and position for the file on disk", function () {
      const broken = 'export default function View() {\n  return <div>;\n}\n';
      writeView(VIEW_ID, { manifest: { name: 'Diag' }, files: { 'View.jsx': broken } });
      reportFromGuest(VIEW_ID, { kind: 'page', revision: 'stale-page' });
      reportFromGuest(VIEW_ID, { kind: 'compile-error', message: 'ignored' });
      const [d] = ViewDiagnostics.get(VIEW_ID);
      expect(d.kind).toBe('compile-error');
      expect(d.revision).toBe(revisionOf(broken));
      expect(d.location).toEqual(locationOf(d.message));
      expect(d.location.line).toBeGreaterThan(1);
    });
  });

  describe('waitForOutcome', function () {
    it('settles at once on records that already arrived', async function () {
      ViewDiagnostics.add({ viewId: VIEW_ID, kind: 'render-ok', message: 'ok', revision: 'a' });
      ViewDiagnostics.add({ viewId: VIEW_ID, kind: 'hang', message: 'stuck', revision: 'b' });
      expect((await ViewDiagnostics.waitForOutcome(VIEW_ID, 'a')).status).toBe('ok');
      expect((await ViewDiagnostics.waitForOutcome(VIEW_ID, 'b')).status).toBe('failed');
    });

    it('waits for render-ok of its own revision and View', async function () {
      const pending = ViewDiagnostics.waitForOutcome(VIEW_ID, 'a', 1000);
      ViewDiagnostics.add({
        viewId: 'another-view',
        kind: 'render-ok',
        message: '',
        revision: 'a',
      });
      ViewDiagnostics.add({ viewId: VIEW_ID, kind: 'render-ok', message: '', revision: 'old' });
      ViewDiagnostics.add({ viewId: VIEW_ID, kind: 'bridge-error', message: '', revision: 'a' });
      ViewDiagnostics.add({ viewId: VIEW_ID, kind: 'render-ok', message: '', revision: 'a' });
      const outcome = await pending;
      expect(outcome.status).toBe('ok');
      expect(outcome.diagnostics.map((d) => d.kind)).toEqual(['bridge-error', 'render-ok']);
      ViewDiagnostics.clear('another-view');
    });

    it('times out with what arrived so far', async function () {
      const pending = ViewDiagnostics.waitForOutcome(VIEW_ID, 'a', 1000);
      ViewDiagnostics.add({ viewId: VIEW_ID, kind: 'bridge-error', message: 'hi', revision: 'a' });
      advanceClock(1001);
      const outcome = await pending;
      expect(outcome.status).toBe('timeout');
      expect(outcome.diagnostics.map((d) => d.kind)).toEqual(['bridge-error']);
    });
  });
});

describe('View diagnostics relay', function () {
  const SOURCE = ['export default function View() {', `  return ${'x'.repeat(300)};`, '}'].join(
    '\n'
  );

  it('relays host-written messages and locations, trimmed', function () {
    const out: any[] = relayableDiagnostics([
      record({
        kind: 'compile-error',
        message: 'Unexpected token (2:9)',
        location: { line: 2, column: 9 },
      }),
      record({ kind: 'crash', message: 'c'.repeat(600) }),
      record({ kind: 'hang', message: 'stuck' }),
      record({ kind: 'consent', message: 'declined' }),
    ]);
    expect(out[0]).toEqual({
      kind: 'compile-error',
      message: 'Unexpected token (2:9)',
      location: { line: 2, column: 9 },
    });
    expect(out[1].message.length).toBe(501);
    expect(out.slice(2)).toEqual([
      { kind: 'hang', message: 'stuck' },
      { kind: 'consent', message: 'declined' },
    ]);
  });

  it('trims the quoted source line and keeps the column inside it', function () {
    const [out]: any[] = relayableDiagnostics(
      [record({ kind: 'runtime-error', stack: 'ReferenceError: x\n at View.jsx:2:9999' })],
      SOURCE
    );
    expect(out.error).toBe('ReferenceError');
    expect(out.location).toEqual({ line: 2, column: SOURCE.split('\n')[1].length + 1 });
    expect(out.source.length).toBe(201);
  });

  it('omits the permission of a bridge error that has none', function () {
    const [out]: any[] = relayableDiagnostics([
      record({ kind: 'bridge-error', method: 'mail.query', code: 'invalid' }),
    ]);
    expect(out).toEqual({ kind: 'bridge-error', method: 'mail.query', code: 'invalid' });
  });

  it('summarizes an outcome for the revision list', function () {
    expect(summarizeOutcome('ok', [])).toBe('Rendered without errors');
    expect(summarizeOutcome('timeout', [])).toBe('Did not finish rendering');
    expect(summarizeOutcome('failed', [record({ kind: 'bridge-error', message: 'x' })])).toBe(
      'Failed'
    );
    expect(
      summarizeOutcome('failed', [
        record({
          kind: 'compile-error',
          message: 'Unexpected token (2:9)\nmore',
          location: { line: 2, column: 9 },
        }),
      ])
    ).toBe('compile-error at View.jsx:2: Unexpected token (2:9)');
  });

  it('names the failure rather than a bridge error that preceded it', function () {
    expect(
      summarizeOutcome('failed', [
        record({ kind: 'bridge-error', message: 'mail.query: invalid' }),
        record({ kind: 'runtime-error', message: 'x is undefined' }),
      ])
    ).toBe('runtime-error: x is undefined');
  });

  it('names a declined consent', function () {
    expect(
      summarizeOutcome('failed', [record({ kind: 'consent', message: 'The user did not allow' })])
    ).toBe('consent: The user did not allow');
  });
});
