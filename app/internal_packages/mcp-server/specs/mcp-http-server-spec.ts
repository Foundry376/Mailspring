import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpHttpServer } from '../lib/mcp-http-server';

// A fixed high port — the spec process is the only thing binding it, and
// start() needs the concrete port up front for its DNS-rebinding allowlist.
const PORT = 21983;
const TOKEN = 'spec-bearer-token';

const initializeBody = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'mcp-http-spec', version: '0.0.1' },
  },
});

function postInitialize(headers: Record<string, string>) {
  return fetch(`http://127.0.0.1:${PORT}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: initializeBody,
  });
}

describe('McpHttpServer', function () {
  beforeEach(function () {
    this.server = new McpHttpServer();
    waitsForPromise(() => this.server.start(PORT, () => TOKEN));
  });

  afterEach(function () {
    waitsForPromise(() => this.server.stop());
  });

  it('rejects requests without a valid bearer token', function () {
    waitsForPromise(async () => {
      const missing = await postInitialize({});
      expect(missing.status).toBe(401);

      const wrong = await postInitialize({ Authorization: 'Bearer not-the-token' });
      expect(wrong.status).toBe(401);
    });
  });

  it('rejects paths other than /mcp', function () {
    waitsForPromise(async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/other`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(res.status).toBe(404);
    });
  });

  it('serves the tools and the attachment resource to an authenticated MCP client', function () {
    waitsForPromise(async () => {
      const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
      });
      const client = new Client({ name: 'mcp-http-spec', version: '0.0.1' });
      await client.connect(transport);
      try {
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name)).toContain('get_attachment');

        const { resourceTemplates } = await client.listResourceTemplates();
        expect(resourceTemplates.map((t) => t.uriTemplate)).toContain(
          'attachment://{messageId}/{fileId}'
        );
      } finally {
        await client.close();
      }
    });
  });
});
