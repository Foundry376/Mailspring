import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  Account,
  AccountStore,
  Actions,
  CategoryStore,
  Folder,
  Label,
  SyncbackCategoryTask,
  TaskQueue,
} from 'mailspring-exports';
import { registerTools, clearAuditLog } from '../lib/mcp-tools';

const imapAccount = new Account({ id: 'imap-1', provider: 'imap' });
const gmailAccount = new Account({ id: 'gmail-1', provider: 'gmail' });

const folders = {
  inbox: new Folder({ id: 'f-inbox', accountId: 'imap-1', path: 'INBOX', role: 'inbox' }),
  work: new Folder({ id: 'f-work', accountId: 'imap-1', path: 'Work' }),
  secret: new Folder({ id: 'f-secret', accountId: 'imap-1', path: 'Work/Secret' }),
  workshop: new Folder({ id: 'f-workshop', accountId: 'imap-1', path: 'Workshop' }),
  label: new Label({ id: 'l-receipts', accountId: 'gmail-1', path: 'Receipts' }),
};

describe('MCP folder and label tools', function () {
  beforeEach(function () {
    AppEnv.config.set('core.mcp.accessLevel', 'read-write');
    AppEnv.config.set('core.mcp.enabledAccounts', {});

    spyOn(AccountStore, 'accountForId').andCallFake(
      (id: string) => ({ 'imap-1': imapAccount, 'gmail-1': gmailAccount })[id]
    );
    spyOn(CategoryStore, 'byId').andCallFake((accountId: string, id: string) =>
      Object.values(folders).find((c) => c.accountId === accountId && c.id === id)
    );

    this.queued = [];
    spyOn(Actions, 'queueTask').andCallFake((task) => this.queued.push(task));
    spyOn(TaskQueue, 'waitForPerformRemote').andCallFake((task: SyncbackCategoryTask) =>
      Promise.resolve(
        Object.assign(task, { created: { id: 'f-new', path: task.path, accountId: 'imap-1' } })
      )
    );

    this.server = new McpServer({ name: 'mailspring-spec', version: '0.0.1' });
    registerTools(this.server);
    this.client = new Client({ name: 'mcp-category-tools-spec', version: '0.0.1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    waitsForPromise(() =>
      Promise.all([this.server.connect(serverTransport), this.client.connect(clientTransport)])
    );
  });

  afterEach(function () {
    clearAuditLog();
    waitsForPromise(() => this.client.close());
  });

  const call = async (client: Client, name: string, args: Record<string, unknown>) => {
    const result: any = await client.callTool({ name, arguments: args });
    return JSON.parse(result.content[0].text);
  };

  it('creates a folder and returns its ID once the server confirms it', function () {
    waitsForPromise(async () => {
      const result = await call(this.client, 'create_folder', {
        accountId: 'imap-1',
        name: 'Receipts/2024',
      });
      expect(result).toEqual({ id: 'f-new', name: 'Receipts/2024', path: 'Receipts/2024' });
      expect(this.queued.length).toBe(1);
      expect(this.queued[0] instanceof SyncbackCategoryTask).toBe(true);
    });
  });

  it('points the agent at the right tool for the account type', function () {
    waitsForPromise(async () => {
      const onGmail = await call(this.client, 'create_folder', { accountId: 'gmail-1', name: 'X' });
      expect(onGmail.error).toContain('Use create_label instead');
      const onImap = await call(this.client, 'create_label', { accountId: 'imap-1', name: 'X' });
      expect(onImap.error).toContain('Use create_folder instead');
      expect(this.queued.length).toBe(0);
    });
  });

  it('renames a user folder, keeping its existing path as the source', function () {
    waitsForPromise(async () => {
      await call(this.client, 'rename_folder', {
        accountId: 'imap-1',
        folderId: 'f-workshop',
        name: 'Workshops',
      });
      expect(this.queued[0].existingPath).toBe('Workshop');
      expect(this.queued[0].path).toBe('Workshops');
    });
  });

  it('renames a label through rename_label', function () {
    waitsForPromise(async () => {
      await call(this.client, 'rename_label', {
        accountId: 'gmail-1',
        labelId: 'l-receipts',
        name: 'Bills',
      });
      expect(this.queued[0].existingPath).toBe('Receipts');
    });
  });

  it('refuses to rename standard folders', function () {
    waitsForPromise(async () => {
      const result = await call(this.client, 'rename_folder', {
        accountId: 'imap-1',
        folderId: 'f-inbox',
        name: 'Elsewhere',
      });
      expect(result.error).toContain("is a standard folder and can't be renamed");
      expect(this.queued.length).toBe(0);
    });
  });

  it('refuses to rename an excluded folder or a parent of one', function () {
    AppEnv.config.set('core.mcp.enabledAccounts', {
      'imap-1': { enabled: true, excludedFolderIds: ['f-secret'] },
    });
    waitsForPromise(async () => {
      const excluded = await call(this.client, 'rename_folder', {
        accountId: 'imap-1',
        folderId: 'f-secret',
        name: 'Open',
      });
      expect(excluded.error).toContain('excluded from MCP access');

      const parent = await call(this.client, 'rename_folder', {
        accountId: 'imap-1',
        folderId: 'f-work',
        name: 'Job',
      });
      expect(parent.error).toContain('contains a folder that is excluded');
      expect(this.queued.length).toBe(0);
    });
  });

  it('does not mistake an excluded sibling that shares a name prefix for a child', function () {
    AppEnv.config.set('core.mcp.enabledAccounts', {
      'imap-1': { enabled: true, excludedFolderIds: ['f-workshop'] },
    });
    waitsForPromise(async () => {
      const result = await call(this.client, 'rename_folder', {
        accountId: 'imap-1',
        folderId: 'f-work',
        name: 'Job',
      });
      expect(result.error).toBeUndefined();
      expect(this.queued.length).toBe(1);
    });
  });

  it('reports a server refusal as an error', function () {
    (TaskQueue.waitForPerformRemote as jasmine.Spy).andCallFake((task) =>
      Promise.resolve(Object.assign(task, { created: null, error: { key: 'ErrorCreate' } }))
    );
    waitsForPromise(async () => {
      const result = await call(this.client, 'create_folder', { accountId: 'imap-1', name: 'X' });
      expect(result.error).toContain('The mail server refused the change');
    });
  });
});
