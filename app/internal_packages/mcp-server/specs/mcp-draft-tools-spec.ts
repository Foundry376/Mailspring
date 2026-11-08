import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  Actions,
  DatabaseStore,
  DraftFactory,
  InlineStyleTransformer,
  Message,
  SyncbackDraftTask,
  TaskQueue,
} from 'mailspring-exports';
import { registerTools, clearAuditLog } from '../lib/mcp-tools';

const STYLE_BLOCK = '<style>p { color: red; }</style>';
const INLINED_MARKER = '<!-- inlined -->';

const HOSTILE_BODY =
  STYLE_BLOCK +
  '<p>Thanks!</p>' +
  '<img src="https://example.com/x.png" onerror="alert(1)">' +
  '<script>alert(2)</script>' +
  '<a href="javascript:alert(3)">link</a>' +
  '<iframe src="https://example.com"></iframe>';

// The inliner should receive sanitized HTML with its <style> block intact, and its output
// is what lands in the draft.
function expectSanitizedThenInlined(body: string) {
  const inliner = InlineStyleTransformer.run as jasmine.Spy;
  expect(inliner.calls.length).toBe(1);
  const inlinerInput = inliner.calls[0].args[0];
  expectSanitized(inlinerInput);
  expect(inlinerInput).toContain(STYLE_BLOCK);
  expect(body).toContain(INLINED_MARKER + inlinerInput);
}

function expectSanitized(body: string) {
  expect(body).toContain('<p>Thanks!</p>');
  expect(body).toContain('<img src="https://example.com/x.png">');
  expect(body).not.toContain('onerror');
  expect(body).not.toContain('<script');
  expect(body).not.toContain('javascript:');
  expect(body).not.toContain('<iframe');
}

describe('MCP draft tools', function () {
  beforeEach(function () {
    AppEnv.config.set('core.mcp.accessLevel', 'read-draft');
    this.server = new McpServer({ name: 'mailspring-spec', version: '0.0.1' });
    registerTools(this.server);
    this.client = new Client({ name: 'mcp-draft-tools-spec', version: '0.0.1' });

    this.queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => this.queued.push(task));
    spyOn(TaskQueue, 'waitForPerformLocal').andReturn(Promise.resolve());
    // The real inliner round-trips through the main process, which specs don't run.
    spyOn(InlineStyleTransformer, 'run').andCallFake((html: string) =>
      Promise.resolve(INLINED_MARKER + html)
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    waitsForPromise(() =>
      Promise.all([this.server.connect(serverTransport), this.client.connect(clientTransport)])
    );
  });

  afterEach(function () {
    clearAuditLog();
    waitsForPromise(() => this.client.close());
  });

  const queuedDraftBody = (queued: any[]) => {
    expect(queued.length).toBe(1);
    expect(queued[0] instanceof SyncbackDraftTask).toBe(true);
    return queued[0].draft.body as string;
  };

  it('create_draft sanitizes the agent-supplied body, then inlines its styles', function () {
    spyOn(DraftFactory, 'createDraft').andCallFake(
      async (fields: any) =>
        new Message({ ...fields, accountId: TEST_ACCOUNT_ID, draft: true } as any)
    );

    waitsForPromise(async () => {
      const result: any = await this.client.callTool({
        name: 'create_draft',
        arguments: { to: [{ email: 'a@example.com' }], subject: 'Hi', body: HOSTILE_BODY },
      });
      expect(result.isError).toBeFalsy();
      expectSanitizedThenInlined(queuedDraftBody(this.queued));
    });
  });

  it('reply_to_thread sanitizes and inlines the agent-supplied body, keeping the quoted reply', function () {
    const thread = { id: 'thread-1', accountId: TEST_ACCOUNT_ID, categories: [] };
    const message = new Message({ id: 'msg-1', accountId: TEST_ACCOUNT_ID, threadId: 'thread-1' });
    spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(thread));
    const messagesQuery: any = { include: () => messagesQuery, order: () => [message] };
    spyOn(DatabaseStore, 'findAll').andReturn(messagesQuery);
    spyOn(DraftFactory, 'createDraftForReply').andReturn(
      Promise.resolve(
        new Message({
          accountId: TEST_ACCOUNT_ID,
          threadId: 'thread-1',
          draft: true,
          body: '<blockquote>Original</blockquote>',
        })
      )
    );

    waitsForPromise(async () => {
      const result: any = await this.client.callTool({
        name: 'reply_to_thread',
        arguments: { threadId: 'thread-1', body: HOSTILE_BODY },
      });
      expect(result.isError).toBeFalsy();
      const body = queuedDraftBody(this.queued);
      expectSanitizedThenInlined(body);
      expect(body).toContain('<blockquote>Original</blockquote>');
    });
  });
});
