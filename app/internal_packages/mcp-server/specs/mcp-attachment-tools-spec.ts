import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Actions, AttachmentStore, DatabaseStore, File, Message } from 'mailspring-exports';
import { registerTools, registerResources, getAuditLog, clearAuditLog } from '../lib/mcp-tools';
import { serializeThreadSummary } from '../lib/mcp-serializers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Smallest valid PNG (1x1 transparent pixel), so the image branch is exercised
// with bytes a client could actually decode.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const TXT_CONTENTS = 'Hello from the attachment spec.\nSecond line.';
const PDF_BYTES = Buffer.from('%PDF-1.4 fake pdf bytes for the resource spec');

function makeFile(fields: Partial<ConstructorParameters<typeof File>[0]> = {}) {
  return new File({
    id: 'file-1',
    filename: 'notes.txt',
    contentType: 'text/plain',
    size: 42,
    messageId: null,
    contentId: null,
    ...fields,
  });
}

function makeMessage(files: File[], fields: { body?: string | null } = {}) {
  return new Message({
    id: 'msg-1',
    accountId: TEST_ACCOUNT_ID,
    threadId: 'thread-1',
    subject: 'Attachment fixtures',
    body: 'body' in fields ? fields.body : '<p>Synced body</p>',
    files,
  } as any);
}

// get_attachment both awaits DatabaseStore.find() directly and calls
// .include() on it before awaiting, so the stand-in for the ModelQuery is a
// resolved promise with a pass-through `include`.
function stubMessageQuery(message: Message | null) {
  const query: any = Promise.resolve(message);
  query.include = () => query;
  return query;
}

const writtenFixtureDirs: string[] = [];

// Writes contents to the exact on-disk path AttachmentStore resolves for the
// file — the same location the sync engine writes to when it fetches a body.
function writeAttachmentToDisk(file: File, contents: Buffer | string) {
  const filePath = AttachmentStore.pathForFile(file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  writtenFixtureDirs.push(path.dirname(filePath));
  return filePath;
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

describe('MCP attachment tools', function () {
  beforeEach(function () {
    this.server = new McpServer({ name: 'mailspring-spec', version: '0.0.1' });
    registerTools(this.server);
    registerResources(this.server);
    this.client = new Client({ name: 'mcp-attachment-spec', version: '0.0.1' });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    waitsForPromise(() =>
      Promise.all([this.server.connect(serverTransport), this.client.connect(clientTransport)])
    );
  });

  afterEach(function () {
    clearAuditLog();
    while (writtenFixtureDirs.length > 0) {
      fs.rmSync(writtenFixtureDirs.pop(), { recursive: true, force: true });
    }
    waitsForPromise(() => this.client.close());
  });

  const callGetAttachment = function (client: Client, message: Message, file: File) {
    return client.callTool({
      name: 'get_attachment',
      arguments: { messageId: message.id, fileId: file.id },
    });
  };

  // For specs that pump the faked clock: the SDK's own request timeout runs
  // on that same clock, so give the request a deadline the pumping can't
  // reach, and fold rejections into the result so nothing goes unhandled.
  const callGetAttachmentWhilePumping = function (
    client: Client,
    message: Message,
    file: File,
    onResult: (result: any) => void
  ) {
    client
      .callTool(
        { name: 'get_attachment', arguments: { messageId: message.id, fileId: file.id } },
        undefined,
        { timeout: 60 * 60 * 1000 }
      )
      .then(onResult, (err) =>
        onResult({
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: `client error: ${err}` }) }],
        })
      );
  };

  describe('get_attachment', function () {
    it('is listed with the other tools', function () {
      waitsForPromise(async () => {
        const { tools } = await this.client.listTools();
        expect(tools.map((t) => t.name)).toContain('get_attachment');
      });
    });

    it('returns text attachments inline as UTF-8', function () {
      const file = makeFile({ id: 'file-txt', filename: 'notes.txt', contentType: 'text/plain' });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));
      writeAttachmentToDisk(file, TXT_CONTENTS);

      waitsForPromise(async () => {
        const result: any = await callGetAttachment(this.client, message, file);
        expect(result.isError).toBeFalsy();
        expect(result.content.length).toBe(1);

        const payload = JSON.parse(result.content[0].text);
        expect(payload.filename).toBe('notes.txt');
        expect(payload.contentType).toBe('text/plain');
        expect(payload.size).toBe(Buffer.byteLength(TXT_CONTENTS));
        expect(payload.data).toBe(TXT_CONTENTS);
        expect(payload.path).toBe(AttachmentStore.pathForFile(file));
        expect(payload.resourceUri).toBe(`attachment://${message.id}/${file.id}`);
      });
    });

    it('strips content-type parameters and falls back to the extension for octet-stream', function () {
      const file = makeFile({
        id: 'file-json',
        filename: 'report.json',
        contentType: 'application/octet-stream',
      });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));
      writeAttachmentToDisk(file, '{"ok": true}');

      waitsForPromise(async () => {
        const result: any = await callGetAttachment(this.client, message, file);
        const payload = JSON.parse(result.content[0].text);
        expect(payload.contentType).toBe('application/json');
        expect(payload.data).toBe('{"ok": true}');
      });
    });

    it('returns images as an MCP image content block after the metadata', function () {
      const file = makeFile({ id: 'file-png', filename: 'pixel.png', contentType: 'image/png' });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));
      writeAttachmentToDisk(file, PNG_BYTES);

      waitsForPromise(async () => {
        const result: any = await callGetAttachment(this.client, message, file);
        expect(result.isError).toBeFalsy();
        expect(result.content.length).toBe(2);
        expect(result.content[0].type).toBe('text');
        expect(result.content[1].type).toBe('image');
        expect(result.content[1].mimeType).toBe('image/png');
        expect(result.content[1].data).toBe(PNG_BYTES.toString('base64'));
      });
    });

    it('returns binary attachments as a resource_link with no inline payload', function () {
      const file = makeFile({
        id: 'file-pdf',
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
      });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));
      writeAttachmentToDisk(file, PDF_BYTES);

      waitsForPromise(async () => {
        const result: any = await callGetAttachment(this.client, message, file);
        expect(result.isError).toBeFalsy();
        expect(result.content.length).toBe(2);

        const payload = JSON.parse(result.content[0].text);
        expect(payload.data).toBeUndefined();
        expect(payload.path).toBe(AttachmentStore.pathForFile(file));

        expect(result.content[1].type).toBe('resource_link');
        expect(result.content[1].uri).toBe(payload.resourceUri);
        expect(result.content[1].name).toBe('invoice.pdf');
        expect(result.content[1].mimeType).toBe('application/pdf');
      });
    });

    it('returns a resource_link instead of inlining text larger than 200KB', function () {
      const file = makeFile({ id: 'file-big', filename: 'big.txt', contentType: 'text/plain' });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));
      writeAttachmentToDisk(file, 'a'.repeat(200 * 1024 + 1));

      waitsForPromise(async () => {
        const result: any = await callGetAttachment(this.client, message, file);
        const payload = JSON.parse(result.content[0].text);
        expect(payload.data).toBeUndefined();
        expect(result.content[1].type).toBe('resource_link');
      });
    });

    it('fetches the message body and waits for the attachment to appear on disk', function () {
      const file = makeFile({ id: 'file-late', filename: 'late.txt', contentType: 'text/plain' });
      const message = makeMessage([file], { body: null });
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));

      // Simulate the sync engine: fetching the body writes the file to disk.
      spyOn(Actions, 'fetchBodies').andCallFake(() => writeAttachmentToDisk(file, TXT_CONTENTS));

      let result: any = null;
      runs(function () {
        callGetAttachmentWhilePumping(this.client, message, file, (r) => (result = r));
      });
      // The tool's poll loop sleeps on the (faked) clock — pump it until the
      // call resolves.
      waitsFor(
        function () {
          advanceClock(500);
          return result !== null;
        },
        'get_attachment to resolve',
        4000
      );
      runs(function () {
        expect(Actions.fetchBodies).toHaveBeenCalledWith([message]);
        expect(result.isError).toBeFalsy();
        expect(JSON.parse(result.content[0].text).data).toBe(TXT_CONTENTS);
      });
    });

    it('errors helpfully when the attachment cannot be downloaded', function () {
      const file = makeFile({ id: 'file-gone', filename: 'gone.txt', contentType: 'text/plain' });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));
      spyOn(Actions, 'fetchBodies');

      let result: any = null;
      runs(function () {
        callGetAttachmentWhilePumping(this.client, message, file, (r) => (result = r));
      });
      // The body is already local, so the tool gives up after its short
      // real-time recheck deadline rather than the full download timeout.
      waitsFor(
        function () {
          advanceClock(500);
          return result !== null;
        },
        'get_attachment to give up',
        10000
      );
      runs(function () {
        expect(result.isError).toBe(true);
        expect(JSON.parse(result.content[0].text).error).toContain('could not be downloaded');
      });
    });

    it('errors when the message has no attachment with the given id', function () {
      const message = makeMessage([makeFile({ id: 'file-real' })]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));

      waitsForPromise(async () => {
        const result: any = await this.client.callTool({
          name: 'get_attachment',
          arguments: { messageId: message.id, fileId: 'file-bogus' },
        });
        expect(result.isError).toBe(true);
        expect(JSON.parse(result.content[0].text).error).toBe(
          `Message 'msg-1' has no attachment with id 'file-bogus'`
        );
      });
    });

    it('reports an unknown message as not found', function () {
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(null));

      waitsForPromise(async () => {
        const result: any = await this.client.callTool({
          name: 'get_attachment',
          arguments: { messageId: 'msg-1', fileId: 'file-1' },
        });
        expect(result.isError).toBe(true);
        expect(JSON.parse(result.content[0].text).error).toBe(`Message 'msg-1' not found`);
      });
    });

    it('reports an excluded account with the same message as an unknown id', function () {
      const file = makeFile();
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));
      AppEnv.config.set('core.mcp.enabledAccounts', {
        'some-other-account': { enabled: true },
      });

      waitsForPromise(async () => {
        const result: any = await callGetAttachment(this.client, message, file);
        expect(result.isError).toBe(true);
        // Deliberately identical to the unknown-id error so callers can't
        // probe for the existence of excluded data.
        expect(JSON.parse(result.content[0].text).error).toBe(`Message 'msg-1' not found`);
      });
    });

    it('records calls in the audit log', function () {
      const file = makeFile({ id: 'file-audit', filename: 'audit.txt' });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));
      writeAttachmentToDisk(file, TXT_CONTENTS);

      waitsForPromise(async () => {
        await callGetAttachment(this.client, message, file);
        const entries = getAuditLog();
        const entry = entries[entries.length - 1];
        expect(entry.toolName).toBe('get_attachment');
        expect(entry.resultSummary).toBe('ok');
      });
    });
  });

  describe('get_message attachment metadata', function () {
    it('lists each attachment in the files array', function () {
      const file = makeFile({ id: 'file-meta', filename: 'photo.png', contentType: 'image/png' });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));

      waitsForPromise(async () => {
        const result: any = await this.client.callTool({
          name: 'get_message',
          arguments: { messageId: message.id },
        });
        const payload = JSON.parse(result.content[0].text);
        expect(payload.files).toEqual([
          {
            id: 'file-meta',
            filename: 'photo.png',
            contentType: 'image/png',
            size: 42,
            isInline: false,
          },
        ]);
      });
    });
  });

  describe('attachment resource', function () {
    it('advertises the attachment resource template', function () {
      waitsForPromise(async () => {
        const { resourceTemplates } = await this.client.listResourceTemplates();
        expect(resourceTemplates.map((t) => t.uriTemplate)).toContain(
          'attachment://{messageId}/{fileId}'
        );
      });
    });

    it('serves raw attachment bytes as a blob via resources/read', function () {
      const file = makeFile({
        id: 'file-blob',
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
      });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));
      writeAttachmentToDisk(file, PDF_BYTES);

      waitsForPromise(async () => {
        const { contents }: any = await this.client.readResource({
          uri: `attachment://${message.id}/${file.id}`,
        });
        expect(contents.length).toBe(1);
        expect(contents[0].mimeType).toBe('application/pdf');
        expect(Buffer.from(contents[0].blob, 'base64').equals(PDF_BYTES)).toBe(true);

        const entries = getAuditLog();
        const entry = entries[entries.length - 1];
        expect(entry.toolName).toBe('resources/read');
        expect(entry.resultSummary).toBe('ok');
      });
    });

    it('rejects reads for attachments that are not on disk', function () {
      const file = makeFile({ id: 'file-nodisk', filename: 'nodisk.pdf' });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));

      waitsForPromise(() =>
        this.client.readResource({ uri: `attachment://${message.id}/${file.id}` }).then(
          () => {
            throw new Error('Expected readResource to reject');
          },
          (err) => expect(`${err}`).toContain('has not been downloaded')
        )
      );
    });

    it('rejects reads for excluded accounts without confirming existence', function () {
      const file = makeFile({ id: 'file-denied' });
      const message = makeMessage([file]);
      spyOn(DatabaseStore, 'find').andCallFake(() => stubMessageQuery(message));
      writeAttachmentToDisk(file, PDF_BYTES);
      AppEnv.config.set('core.mcp.enabledAccounts', {
        'some-other-account': { enabled: true },
      });

      waitsForPromise(() =>
        this.client.readResource({ uri: `attachment://${message.id}/${file.id}` }).then(
          () => {
            throw new Error('Expected readResource to reject');
          },
          // Deliberately the same phrasing as an unknown message id, so
          // callers can't probe for the existence of excluded data.
          (err) => expect(`${err}`).toContain(`Message 'msg-1' not found`)
        )
      );
    });
  });

  describe('thread summaries', function () {
    it('include the attachment count', function () {
      const summary = serializeThreadSummary({
        id: 'thread-1',
        subject: 'S',
        accountId: TEST_ACCOUNT_ID,
        attachmentCount: 3,
        categories: [],
        participants: [],
      } as any);
      expect(summary.attachmentCount).toBe(3);
    });
  });
});
