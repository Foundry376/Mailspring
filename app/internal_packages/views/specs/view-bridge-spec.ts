import Rx from 'rx-lite';
import { ViewBridge, CALL_CHANNEL, HELLO_CHANNEL } from '../lib/view-bridge';
import { HANDLERS, mailQuery, BridgeContext } from '../lib/bridge/handlers';
import { ViewGrant, ViewPermission } from '../lib/bridge/grant';
import { serializeThreadSummary } from '../lib/bridge/serializers';
import { FULL_GRANT } from '../../mcp-server/lib/capabilities/grant';
import fs from 'fs';
import { ipcRenderer } from 'electron';
import {
  Thread,
  Contact,
  Folder,
  Message,
  File,
  AttachmentStore,
  MessageBodyProcessor,
} from 'mailspring-exports';
import { renderableFor } from '../lib/bridge/renderable';

function grantWith(permissions: ViewPermission[], scope = FULL_GRANT): ViewGrant {
  return { viewId: 'spec', namespace: 'view:spec', permissions: new Set(permissions), scope };
}

function ctxWith(grant: ViewGrant): BridgeContext {
  return { viewId: 'spec', grant, emit: () => {} };
}

// Handlers may throw synchronously or reject; both are how a call fails.
async function errorFrom(fn: () => any) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return null;
}

describe('View bridge', function () {
  describe('permissions', function () {
    const REQUIRED: [string, ViewPermission, any][] = [
      ['accounts.list', 'mail.read', {}],
      ['threads.find', 'mail.read', { query: 'in:inbox' }],
      ['messages.find', 'mail.read', { query: 'in:inbox' }],
      ['counts.find', 'mail.read', { query: '', groupBy: 'sender' }],
      ['events.find', 'calendar.read', { start: '2026-01-01', end: '2026-02-01' }],
      ['events.freeBusy', 'calendar.read', { start: '2026-01-01', end: '2026-02-01' }],
      ['calendars.find', 'calendar.read', {}],
      ['calendar.rsvp', 'calendar.write', { id: 'e1', status: 'accepted' }],
      [
        'calendar.createEvent',
        'calendar.write',
        {
          calendarId: 'c1',
          title: 'x',
          start: '2026-01-01T10:00:00Z',
          end: '2026-01-01T11:00:00Z',
        },
      ],
      ['calendar.updateEvent', 'calendar.write', { id: 'e1', patch: { title: 'y' } }],
      ['calendar.deleteEvent', 'calendar.write', { id: 'e1' }],
      ['ui.showEvent', 'calendar.read', { id: 'e1' }],
      ['messages.content', 'mail.bodies', { ids: ['m1'] }],
      ['metadata.set', 'metadata.own', { kind: 'thread', id: 't1', value: {} }],
      ['mail.modify', 'mail.modify', { threadIds: ['t1'], change: { starred: true } }],
      ['messages.renderable', 'mail.bodies', { ids: ['m1'] }],
      ['attachments.url', 'mail.bodies', { fileId: 'f1' }],
    ];

    REQUIRED.forEach(([method, permission, params]) => {
      it(`rejects ${method} without ${permission}`, async () => {
        const others = (
          [
            'mail.read',
            'mail.bodies',
            'metadata.own',
            'mail.modify',
            'calendar.read',
            'calendar.write',
          ] as ViewPermission[]
        ).filter((p) => p !== permission);
        const err = await errorFrom(() => HANDLERS[method](ctxWith(grantWith(others)), params));
        expect(err && err.code).toBe('permission');
        expect(err.permission).toBe(permission);
      });
    });
  });

  describe('mailQuery', function () {
    const grant = grantWith(['mail.read']);

    it('treats a string as a search and applies the default limit', () => {
      const q = mailQuery(grant, 'threads', 'from:uber.com');
      expect(q.search).toBe('from:uber.com');
      expect(q.limit).toBe(100);
    });

    it('scopes `tagged` to the View namespace and nothing else', () => {
      expect(mailQuery(grant, 'threads', { tagged: true }).metadataPluginId).toBe('view:spec');
      expect(mailQuery(grant, 'threads', {}).metadataPluginId).toBe(undefined);
    });

    it('rejects limits over the cap and malformed queries', () => {
      const codeFor = (query) => {
        try {
          mailQuery(grant, 'threads', query);
        } catch (err) {
          return err.code;
        }
        return null;
      };
      expect(codeFor({ limit: 5000 })).toBe('limit');
      expect(codeFor({ ids: 'nope' })).toBe('invalid');
    });
  });

  describe('serializeThreadSummary', function () {
    const thread = new Thread({
      id: 't1',
      accountId: 'a1',
      subject: 'Hi',
      participants: [
        new Contact({ email: 'me@example.com', name: 'Me' }),
        new Contact({ email: 'them@example.com', name: 'Them' }),
      ],
      folders: [new Folder({ id: 'f-excluded', accountId: 'a1', path: 'Secret' })],
    });

    beforeEach(() => {
      spyOn(Contact.prototype, 'isMe').andCallFake(function () {
        return this.email === 'me@example.com';
      });
    });

    it('puts counterparties before the account owner', () => {
      const summary = serializeThreadSummary(grantWith(['mail.read']), thread);
      expect(summary.participants.map((p) => p.email)).toEqual([
        'them@example.com',
        'me@example.com',
      ]);
      expect(summary.participants[1].isMe).toBe(true);
    });

    it('returns null for threads outside the grant', () => {
      const scoped = grantWith(['mail.read'], {
        accountIds: null,
        excludedFolderIds: { a1: ['f-excluded'] },
      });
      expect(serializeThreadSummary(scoped, thread)).toBe(null);
      expect(
        serializeThreadSummary(
          grantWith(['mail.read'], { accountIds: ['other'], excludedFolderIds: {} }),
          thread
        )
      ).toBe(null);
    });

    it('never includes another plugin namespace as meta', () => {
      thread.directlyAttachMetadata('send-later', { expiration: 1 });
      expect(serializeThreadSummary(grantWith(['mail.read']), thread).meta).toBe(null);
      thread.directlyAttachMetadata('view:spec', { column: 'Done' });
      expect(serializeThreadSummary(grantWith(['mail.read']), thread).meta).toEqual({
        column: 'Done',
      });
    });
  });
});

describe('ViewBridge dispatch limits', function () {
  function fakeWebview() {
    const replies = [];
    let listener = null;
    let helloSent = false;
    return {
      replies,
      addEventListener: (name, fn) => (listener = fn),
      removeEventListener: () => {},
      send: (channel, payload) => replies.push(payload),
      call: (id, method, params) => {
        if (!helloSent) {
          helloSent = true;
          listener({ channel: HELLO_CHANNEL, args: [{ page: 'p1' }] });
        }
        return listener({ channel: CALL_CHANNEL, args: [{ page: 'p1', id, method, params }] });
      },
    };
  }

  it('rejects oversized parameters before dispatch', async () => {
    const webview = fakeWebview();
    const bridge = new ViewBridge('spec', webview as any);
    await webview.call(1, 'ui.setHeight', { blob: 'x'.repeat(2 * 1024 * 1024) });
    expect(webview.replies[0].error.code).toBe('limit');
    bridge.dispose();
  });

  it('delivers a snapshot a shared query replays synchronously on subscribe', async () => {
    const webview = fakeWebview();
    const bridge = new ViewBridge('spec', webview as any);
    // QuerySubscriptionPool replays an already-running query's last result inside subscribe().
    spyOn(bridge as any, 'observableFor').andReturn(Rx.Observable.just({ data: { busy: [] } }));
    await webview.call(1, 'subscribe', { subId: 's1', kind: 'freeBusy', params: {} });
    const snapshot = webview.replies.find((r) => r.event === 'subscription');
    expect(snapshot && snapshot.payload.subId).toBe('s1');
    expect(snapshot.payload.data).toEqual({ busy: [] });
    bridge.dispose();
  });

  it('answers calls beyond the rate limit with a limit error', async () => {
    const webview = fakeWebview();
    const bridge = new ViewBridge('spec', webview as any);
    await Promise.all([...Array(1000)].map((_, i) => webview.call(i, 'ui.setHeight', { px: 1 })));
    const codes = webview.replies.map((r) => (r.error ? r.error.code : 'ok'));
    expect(codes.length).toBe(1000);
    expect(codes.filter((c) => c === 'ok').length).toBeLessThan(500);
    expect(codes.filter((c) => c === 'limit').length).toBeGreaterThan(500);
    bridge.dispose();
  });
});

describe('renderableFor', function () {
  const grant = grantWith(['mail.read', 'mail.bodies']);
  let registered;

  function messageWithBody(body: string) {
    return new Message({
      id: 'm1',
      accountId: 'a1',
      body,
      files: [
        new File({ id: 'f1', contentId: 'logo@x', filename: 'logo.png', contentType: 'image/png' }),
      ],
    } as any);
  }

  beforeEach(() => {
    registered = [];
    spyOn(MessageBodyProcessor, 'retrieve').andCallFake(async (m: Message) => ({
      body: m.body,
      clipped: false,
    }));
    spyOn(AttachmentStore, 'pathForFile').andReturn('/files/f1/logo.png');
    spyOn(fs, 'existsSync').andReturn(true);
    spyOn(ipcRenderer, 'invoke').andCallFake(async (channel, viewId, entries) => {
      registered.push(...entries);
      return entries.map((e, i) =>
        e.kind === 'remote' && e.url.includes('blocked') ? null : `tok${i}`
      );
    });
  });

  it('points inline and remote images at host-served tokens', async () => {
    const { html } = await renderableFor(
      grant,
      messageWithBody(
        '<img src="cid:logo@x"><img src="https://img.example.com/a.png">' +
          '<div style="background: url(\'https://img.example.com/b.png\')">x</div>'
      )
    );
    expect(registered.map((e) => e.kind)).toEqual(['file', 'remote', 'remote']);
    expect(registered[0].filePath).toBe('/files/f1/logo.png');
    expect(html).toContain('src="mailspring-view://spec/_res/tok0"');
    expect(html).toContain('src="mailspring-view://spec/_res/tok1"');
    expect(html).toContain('url(&quot;mailspring-view://spec/_res/tok2&quot;)');
    expect(html).not.toContain('img.example.com');
  });

  it('drops scripts, frames, unresolvable and policy-blocked images', async () => {
    const { html } = await renderableFor(
      grant,
      messageWithBody(
        '<script>alert(1)</script><iframe src="https://x.com"></iframe>' +
          '<img src="#"><img src="javascript:alert(1)"><img src="https://blocked.example.com/p.gif">'
      )
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('blocked.example.com');
    expect(html.match(/<img>/g).length).toBe(3);
  });

  it('escapes plaintext bodies', async () => {
    const message = messageWithBody('<b>not bold</b>');
    message.plaintext = true;
    const { html, plaintext } = await renderableFor(grant, message);
    expect(plaintext).toBe(true);
    expect(html).toContain('&#60;b&#62;not bold');
  });

  it('refuses messages outside the grant', async () => {
    const scoped = grantWith(['mail.bodies'], { accountIds: ['other'], excludedFolderIds: {} });
    const err = await errorFrom(() => renderableFor(scoped, messageWithBody('hi')));
    expect(err && err.code).toBe('not_found');
  });
});
