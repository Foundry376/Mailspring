import crypto from 'crypto';
import { Contact, Message } from 'mailspring-exports';
import { canonicalJSON, checkSignedRevision } from '../lib/agent/signing';
import { SSEParser, AgentTransport } from '../lib/agent/client';
import { buildExample, chipFor } from '../lib/agent/examples';
import { relayableDiagnostics } from '../lib/agent/tools';
import { AgentSessionStore } from '../lib/agent/store';
import { AgentAPIError, Example } from '../lib/agent/types';

const IDENTITY = 'identity-1';
const VIEW = 'receipts-abc123';

function keypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    sign: (payload: object) =>
      crypto.sign(null, Buffer.from(canonicalJSON(payload), 'utf8'), privateKey).toString('base64'),
  };
}

const REVISION = {
  revision: 1,
  manifest: { name: 'Receipts', permissions: ['mail.read'] },
  files: { 'View.jsx': 'export default () => null;\n' },
};

// The spec runner fakes setTimeout, so drain the microtask queue instead.
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('Views agent: signing', function () {
  it('serializes canonical JSON with sorted keys and no whitespace', () => {
    expect(canonicalJSON({ b: 1, a: { d: [3, { z: 1, y: 'é' }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":"é","z":1}]},"b":1}'
    );
  });

  it('accepts a revision signed for this account and View', () => {
    const k = keypair();
    const signature = k.sign({ identityId: IDENTITY, viewId: VIEW, ...REVISION });
    const result = checkSignedRevision({
      input: REVISION,
      signature,
      publicKey: k.publicKey,
      identityId: IDENTITY,
      viewId: VIEW,
      lastAcceptedRevision: 0,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects tampered code, another View or account, unsigned and replayed revisions', () => {
    const k = keypair();
    const signature = k.sign({ identityId: IDENTITY, viewId: VIEW, ...REVISION });
    const base = {
      input: REVISION,
      signature,
      publicKey: k.publicKey,
      identityId: IDENTITY,
      viewId: VIEW,
      lastAcceptedRevision: 0,
    };
    const tampered = { ...REVISION, files: { 'View.jsx': 'fetch("https://evil")' } };
    expect(checkSignedRevision({ ...base, input: tampered }).ok).toBe(false);
    expect(checkSignedRevision({ ...base, viewId: 'other-view' }).ok).toBe(false);
    expect(checkSignedRevision({ ...base, identityId: 'someone-else' }).ok).toBe(false);
    expect(checkSignedRevision({ ...base, signature: undefined }).ok).toBe(false);
    expect(checkSignedRevision({ ...base, publicKey: keypair().publicKey }).ok).toBe(false);
    expect(checkSignedRevision({ ...base, publicKey: null }).ok).toBe(false);
    const replay = checkSignedRevision({ ...base, lastAcceptedRevision: 1 });
    expect(replay.ok).toBe(false);
    expect((replay as any).reason).toContain('not newer');
  });
});

describe('Views agent: SSE parsing', function () {
  it('parses events split across chunks and skips comments', () => {
    const parser = new SSEParser();
    expect(parser.push(': keepalive\n\nid: 1\ndata: {"a"')).toEqual([]);
    const events = parser.push(':1}\n\nid: 2\nevent: x\ndata: line1\r\ndata: line2\n\n');
    expect(events).toEqual([
      { id: '1', event: null, data: '{"a":1}' },
      { id: '2', event: 'x', data: 'line1\nline2' },
    ]);
  });
});

describe('Views agent: examples', function () {
  const message = (body: string, extra = {}) =>
    new Message({
      id: 'm1',
      threadId: 't1',
      accountId: 'acc',
      subject: 'Your order shipped',
      date: new Date('2026-09-01T12:00:00Z'),
      from: [new Contact({ name: 'Shop', email: 'orders@shop.example' })],
      to: [new Contact({ name: 'Me', email: 'me@example.com' })],
      body,
      ...extra,
    });

  it('keeps text and links but drops anything that loads or runs', () => {
    const example = buildExample(
      message(
        `<style>.h{background:url(https://t.example/bg.png)} @import url(https://x/y.css);</style>
         <p style="background-image:url('https://t.example/a.png')">Tracking 1Z999AA10123456784</p>
         <img src="https://t.example/open.gif" width="1" height="1">
         <img src="cid:logo123" alt="Shop logo">
         <img srcset="https://t.example/a.png 2x" src="https://t.example/b.png">
         <a href="https://shop.example/track/1Z999">Track</a>
         <script>alert(1)</script><iframe src="https://evil.example"></iframe>`
      )
    );
    expect(example.text).toContain('Tracking 1Z999AA10123456784');
    expect(example.html).toContain('href="https://shop.example/track/1Z999"');
    expect(example.html).toContain('Shop logo');
    expect(example.html).not.toContain('t.example');
    expect(example.html).not.toContain('cid:');
    expect(example.html).not.toContain('<img');
    expect(example.html).not.toContain('<script');
    expect(example.html).not.toContain('evil.example');
    expect(example.html).not.toContain('@import');
    expect(example.from).toEqual([{ name: 'Shop', email: 'orders@shop.example' }]);
    expect(example.date).toBe('2026-09-01T12:00:00.000Z');
  });

  it('strips quoted replies and summarizes the example as a chip', () => {
    const example = buildExample(
      message(
        `<p>Thanks, see below.</p><blockquote class="gmail_quote">On Monday you wrote: secret</blockquote>`
      )
    );
    expect(example.text).toContain('Thanks, see below.');
    expect(example.text).not.toContain('secret');
    const chip = chipFor(example);
    expect(chip.from).toBe('Shop');
    expect(chip.snippet).toBe('Thanks, see below.');
    expect(chip.bytes).toBeGreaterThan(0);
  });

  it('sends empty content for a body that is not downloaded', () => {
    const example = buildExample(message(null));
    expect(example.text).toBe('');
    expect(example.html).toBe('');
  });
});

describe('Views agent: diagnostics relay', function () {
  it('sends failures and render-ok but never console output', () => {
    const out = relayableDiagnostics([
      { ts: 1, viewId: VIEW, revision: 'r', kind: 'console', message: 'Subject: private' },
      {
        ts: 2,
        viewId: VIEW,
        revision: 'r',
        kind: 'runtime-error',
        message: 'x'.repeat(900),
        location: { line: 4, column: 2 },
      },
      { ts: 3, viewId: VIEW, revision: 'r', kind: 'render-ok', message: 'ok' },
    ]);
    expect(out.map((d) => d.kind)).toEqual(['runtime-error', 'render-ok']);
    expect(out[0].message.length).toBeLessThan(510);
    expect(out[0].location).toEqual({ line: 4, column: 2 });
  });
});

describe('Views agent: session store', function () {
  let transport: { [K in keyof AgentTransport]: jasmine.Spy };
  let previewAndWait: jasmine.Spy;
  let accepted: { [viewId: string]: number };
  let keys: ReturnType<typeof keypair>;
  const examples: Example[] = [
    {
      messageId: 'm1',
      threadId: 't1',
      from: [{ name: 'Shop', email: 'orders@shop.example' }],
      to: [],
      cc: [],
      subject: 'Shipped',
      date: '2026-09-01T12:00:00.000Z',
      text: 'Your package shipped',
      html: '<p>Your package shipped</p>',
    },
  ];

  beforeEach(() => {
    keys = keypair();
    accepted = {};
    previewAndWait = jasmine
      .createSpy('previewAndWait')
      .andReturn(Promise.resolve({ status: 'ok', diagnostics: [] }));
    transport = {
      createSession: jasmine
        .createSpy('createSession')
        .andReturn(Promise.resolve({ viewId: VIEW, sessionId: 's', resumed: false })),
      sendMessage: jasmine.createSpy('sendMessage').andReturn(Promise.resolve()),
      sendToolResult: jasmine.createSpy('sendToolResult').andReturn(Promise.resolve()),
      interrupt: jasmine.createSpy('interrupt').andReturn(Promise.resolve()),
      budget: jasmine.createSpy('budget').andReturn(Promise.resolve({ maxListCostCents: 400 })),
      publicKey: jasmine.createSpy('publicKey').andReturn(Promise.resolve(keys.publicKey)),
      streamEvents: jasmine
        .createSpy('streamEvents')
        .andCallFake((viewId, onEvent, signal, onOpen) => {
          if (onOpen) onOpen();
          return new Promise(() => {});
        }),
    };
    AgentSessionStore.configure({
      transport: transport as any,
      identityId: () => IDENTITY,
      configuredPublicKey: () => keys.publicKey,
      devMode: () => false,
      lastAcceptedRevision: (viewId) => accepted[viewId] || 0,
      setAcceptedRevision: (viewId, revision) => (accepted[viewId] = revision),
      buildExamples: async () => examples,
      currentBundle: () => null,
      previewAndWait,
      capturePreview: async () => ({ png: Buffer.from('png'), width: 10, height: 20 }),
      promoteDraft: jasmine.createSpy('promoteDraft'),
      discardDraft: jasmine.createSpy('discardDraft'),
      showUpgrade: jasmine.createSpy('showUpgrade'),
    });
  });

  const start = async () => {
    await AgentSessionStore.start({ viewId: VIEW, name: 'Receipts', request: 'Chart my receipts' });
  };

  it('creates the session, opens the stream and records the request', async () => {
    await start();
    expect(transport.createSession).toHaveBeenCalled();
    expect(transport.streamEvents).toHaveBeenCalled();
    const s = AgentSessionStore.session(VIEW);
    expect(AgentSessionStore.activeViewId()).toBe(VIEW);
    expect(s.transcript[0].role).toBe('user');
    expect(s.transcript[0].text).toBe('Chart my receipts');
  });

  it('turns a quota rejection into the upgrade prompt and an error', async () => {
    transport.createSession.andReturn(
      Promise.reject(
        new AgentAPIError('Over quota', {
          statusCode: 429,
          code: 'quota',
          details: { feature: 'view-agent-build' },
        })
      )
    );
    await start();
    expect(AgentSessionStore.session(VIEW).error.code).toBe('quota');
    expect((AgentSessionStore as any).d.showUpgrade).toHaveBeenCalledWith('view-agent-build');
  });

  it('surfaces no_session from resume', async () => {
    transport.streamEvents.andReturn(
      Promise.reject(new AgentAPIError('No session', { statusCode: 404, code: 'no_session' }))
    );
    let error = null;
    try {
      await AgentSessionStore.resume(VIEW, 'Receipts');
    } catch (err) {
      error = err;
    }
    expect(error && error.code).toBe('no_session');
    expect(AgentSessionStore.session(VIEW).error.code).toBe('no_session');
  });

  it('applies messages once, and replaces optimistic user turns with their echoes', async () => {
    await start();
    AgentSessionStore.onEvent(VIEW, { id: 'e1', type: 'user_message', text: 'Chart my receipts' });
    AgentSessionStore.onEvent(VIEW, { id: 'e2', type: 'message', text: 'Sure.' });
    AgentSessionStore.onEvent(VIEW, { id: 'e2', type: 'message', text: 'Sure.' });
    const t = AgentSessionStore.session(VIEW).transcript;
    expect(t.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('previews a signed revision once and reports the outcome', async () => {
    await start();
    const event = {
      id: 'e3',
      type: 'tool_request' as const,
      toolUseId: 'tu1',
      name: 'preview_revision',
      input: REVISION,
      signature: keys.sign({ identityId: IDENTITY, viewId: VIEW, ...REVISION }),
    };
    AgentSessionStore.onEvent(VIEW, event);
    AgentSessionStore.onEvent(VIEW, { ...event, id: 'e3-replayed' });
    AgentSessionStore.onEvent(VIEW, { ...event, id: 'e4', toolUseId: 'tu0', resolved: true });
    await flush();
    await flush();
    expect(previewAndWait.callCount).toBe(1);
    expect(accepted[VIEW]).toBe(1);
    const [, body] = transport.sendToolResult.mostRecentCall.args;
    expect(body.toolUseId).toBe('tu1');
    expect(JSON.parse(body.content[0].text).status).toBe('ok');
    expect(AgentSessionStore.session(VIEW).revisions[0].status).toBe('ok');
  });

  it('refuses an unsigned revision without previewing it', async () => {
    await start();
    AgentSessionStore.onEvent(VIEW, {
      id: 'e5',
      type: 'tool_request',
      toolUseId: 'tu2',
      name: 'preview_revision',
      input: REVISION,
    });
    await flush();
    await flush();
    expect(previewAndWait).not.toHaveBeenCalled();
    const [, body] = transport.sendToolResult.mostRecentCall.args;
    expect(body.isError).toBe(true);
    expect(AgentSessionStore.session(VIEW).revisions[0].status).toBe('rejected');
  });

  it('asks for examples and returns the staged ones', async () => {
    await start();
    AgentSessionStore.onEvent(VIEW, {
      id: 'e6',
      type: 'tool_request',
      toolUseId: 'tu3',
      name: 'request_examples',
      input: { prompt: 'Drop a delivered package email' },
    });
    await flush();
    let s = AgentSessionStore.session(VIEW);
    expect(s.pendingRequest.kind).toBe('examples');
    expect(s.pendingRequest.prompt).toBe('Drop a delivered package email');
    await AgentSessionStore.attachThreads(VIEW, ['t1']);
    expect(AgentSessionStore.session(VIEW).attachedExamples.length).toBe(1);
    AgentSessionStore.submitExamples(VIEW);
    await flush();
    s = AgentSessionStore.session(VIEW);
    expect(s.pendingRequest).toBe(null);
    expect(s.attachedExamples).toEqual([]);
    const [, body] = transport.sendToolResult.mostRecentCall.args;
    expect(JSON.parse(body.content[0].text).examples[0].messageId).toBe('m1');
  });

  it('asks before sending a screenshot', async () => {
    await start();
    AgentSessionStore.onEvent(VIEW, {
      id: 'e7',
      type: 'tool_request',
      toolUseId: 'tu4',
      name: 'request_screenshot',
      input: { reason: 'Check the chart layout' },
    });
    await flush();
    await flush();
    const pending = AgentSessionStore.session(VIEW).pendingRequest;
    expect(pending.kind).toBe('screenshot');
    expect(pending.screenshot.dataUrl).toBe(
      `data:image/png;base64,${Buffer.from('png').toString('base64')}`
    );
    expect(transport.sendToolResult).not.toHaveBeenCalled();
    AgentSessionStore.approveScreenshot(VIEW);
    await flush();
    const [, body] = transport.sendToolResult.mostRecentCall.args;
    expect(body.content[0]).toEqual({
      type: 'image',
      mediaType: 'image/png',
      dataBase64: Buffer.from('png').toString('base64'),
    });
  });

  it('answers questions and declined screenshots as text', async () => {
    await start();
    AgentSessionStore.onEvent(VIEW, {
      id: 'e8',
      type: 'tool_request',
      toolUseId: 'tu5',
      name: 'ask_user',
      input: { question: 'Group by month?', choices: ['Yes', 'No'] },
    });
    await flush();
    expect(AgentSessionStore.session(VIEW).pendingRequest.choices).toEqual(['Yes', 'No']);
    AgentSessionStore.answerQuestion(VIEW, 'Yes');
    await flush();
    let [, body] = transport.sendToolResult.mostRecentCall.args;
    expect(body.content).toEqual([{ type: 'text', text: 'Yes' }]);

    AgentSessionStore.onEvent(VIEW, {
      id: 'e9',
      type: 'tool_request',
      toolUseId: 'tu6',
      name: 'request_screenshot',
      input: {},
    });
    await flush();
    await flush();
    AgentSessionStore.declineScreenshot(VIEW);
    await flush();
    [, body] = transport.sendToolResult.mostRecentCall.args;
    expect(body.content).toEqual([{ type: 'text', text: 'declined' }]);
  });

  it('sends staged examples with the next message', async () => {
    await start();
    await AgentSessionStore.attachThreads(VIEW, ['t1']);
    await AgentSessionStore.sendMessage(VIEW, 'These two are wrong');
    const [, body] = transport.sendMessage.mostRecentCall.args;
    expect(body.text).toBe('These two are wrong');
    expect(body.examples.length).toBe(1);
    const last = AgentSessionStore.session(VIEW).transcript.slice(-1)[0];
    expect(last.attachments.length).toBe(1);
  });

  it('tracks status, usage and budget raises', async () => {
    await start();
    AgentSessionStore.onEvent(VIEW, {
      id: 'u1',
      type: 'usage',
      listCostCents: 150,
      maxListCostCents: 200,
    });
    AgentSessionStore.onEvent(VIEW, { id: 's1', type: 'status', status: 'budget_reached' });
    expect(AgentSessionStore.session(VIEW).status).toBe('budget_reached');
    await AgentSessionStore.raiseBudget(VIEW);
    expect(transport.budget).toHaveBeenCalledWith(VIEW, 'raise');
    expect(AgentSessionStore.session(VIEW).usage.maxListCostCents).toBe(400);
  });
});
