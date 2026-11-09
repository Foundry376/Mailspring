import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { DatabaseStore } from 'mailspring-exports';
import { registerTools, clearAuditLog } from '../lib/mcp-tools';
import { checkAccessLevel, AccessCategory } from '../lib/mcp-access-control';

const LEVELS = ['read-only', 'read-draft', 'read-write', 'read-write-send'];
const CATEGORIES: AccessCategory[] = ['read', 'draft', 'write', 'send'];

const GRANTED: { [level: string]: AccessCategory[] } = {
  'read-only': ['read'],
  'read-draft': ['read', 'draft'],
  'read-write': ['read', 'draft', 'write'],
  'read-write-send': ['read', 'draft', 'write', 'send'],
};

const THREAD_ARGS = { threadIds: ['thread-1'] };

// Each tool with arguments that pass schema validation, so a rejection can only come
// from the access-level gate.
const MUTATING_TOOLS: { name: string; args: object }[] = [
  { name: 'archive_threads', args: THREAD_ARGS },
  { name: 'trash_threads', args: THREAD_ARGS },
  { name: 'move_to_folder', args: { ...THREAD_ARGS, folderId: 'folder-1' } },
  { name: 'set_labels', args: { ...THREAD_ARGS, labelsToAdd: ['label-1'] } },
  { name: 'set_unread', args: { ...THREAD_ARGS, unread: true } },
  { name: 'set_starred', args: { ...THREAD_ARGS, starred: true } },
  { name: 'cancel_scheduled_send', args: { headerMessageId: 'draft-1' } },
  { name: 'send_draft', args: { headerMessageId: 'draft-1' } },
  { name: 'schedule_send', args: { headerMessageId: 'draft-1', sendAt: '2099-01-01T09:00:00Z' } },
];

describe('MCP access levels', function () {
  describe('checkAccessLevel', function () {
    it('grants each level its own category and every category below it', function () {
      for (const level of LEVELS) {
        AppEnv.config.set('core.mcp.accessLevel', level);
        for (const category of CATEGORIES) {
          const allowed = checkAccessLevel(category) === null;
          expect(`${level}/${category}: ${allowed}`).toBe(
            `${level}/${category}: ${GRANTED[level].includes(category)}`
          );
        }
      }
    });

    it('defaults to read-only when no level is stored', function () {
      expect(checkAccessLevel('read')).toBe(null);
      expect(checkAccessLevel('draft')).toContain(`require access level 'read-draft'`);
    });

    it('treats an unrecognized stored level as read-only', function () {
      AppEnv.config.set('core.mcp.accessLevel', 'everything');
      expect(checkAccessLevel('read')).toBe(null);
      expect(checkAccessLevel('draft')).not.toBe(null);
    });
  });

  describe('tools under read-draft', function () {
    beforeEach(function () {
      AppEnv.config.set('core.mcp.accessLevel', 'read-draft');
      this.server = new McpServer({ name: 'mailspring-spec', version: '0.0.1' });
      registerTools(this.server);
      this.client = new Client({ name: 'mcp-access-level-spec', version: '0.0.1' });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      waitsForPromise(() =>
        Promise.all([this.server.connect(serverTransport), this.client.connect(clientTransport)])
      );
    });

    afterEach(function () {
      clearAuditLog();
      waitsForPromise(() => this.client.close());
    });

    const errorOf = (result: any) => JSON.parse(result.content[0].text).error as string;

    it('lets reply_to_thread through to its handler', function () {
      spyOn(DatabaseStore, 'find').andReturn(Promise.resolve(null));

      waitsForPromise(async () => {
        const result: any = await this.client.callTool({
          name: 'reply_to_thread',
          arguments: { threadId: 'thread-1', body: '<p>Hi</p>' },
        });
        expect(errorOf(result)).toBe(`Thread 'thread-1' not found`);
      });
    });

    it('rejects every tool that changes existing mail or sends', function () {
      waitsForPromise(async () => {
        for (const { name, args } of MUTATING_TOOLS) {
          const result: any = await this.client.callTool({ name, arguments: args });
          expect(`${name}: ${errorOf(result)}`).toMatch(
            new RegExp(`^${name}: Access denied: '(write|send)' operations require`)
          );
        }
      });
    });
  });
});
