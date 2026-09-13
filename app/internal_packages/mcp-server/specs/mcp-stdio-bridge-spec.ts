import fs from 'fs';
import os from 'os';
import path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { McpHttpServer } from '../lib/mcp-http-server';

const PORT = 21985;
const TOKEN = 'spec-bridge-token';
const BRIDGE = path.join(__dirname, '..', 'lib', 'mcp-stdio-bridge.js');

interface JsonRpcMessage {
  id?: number | string;
  result?: any;
  error?: { code: number; message: string };
}

// Drives the bridge the way Claude Desktop does: newline-delimited JSON-RPC
// over the child's stdin/stdout, run under Electron-as-Node.
class BridgeClient {
  child: ChildProcess;
  received: JsonRpcMessage[] = [];
  stderr = '';
  private waiters: (() => void)[] = [];
  private buffered = '';

  constructor(configDir: string) {
    this.child = spawn(process.execPath, [BRIDGE, '--config-dir', configDir], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.buffered += chunk;
      let newline: number;
      while ((newline = this.buffered.indexOf('\n')) !== -1) {
        const line = this.buffered.slice(0, newline);
        this.buffered = this.buffered.slice(newline + 1);
        if (line.trim()) this.received.push(JSON.parse(line));
      }
      this.waiters.splice(0).forEach((w) => w());
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => (this.stderr += chunk));
  }

  send(message: object) {
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }

  response(id: number): Promise<JsonRpcMessage> {
    return new Promise((resolve) => {
      const check = () => {
        const match = this.received.find((m) => m.id === id);
        if (match) resolve(match);
        else this.waiters.push(check);
      };
      check();
    });
  }

  async initialize() {
    this.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'bridge-spec', version: '0.0.1' },
      },
    });
    const init = await this.response(1);
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return init;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.child.on('exit', () => resolve());
      this.child.stdin.end();
    });
  }
}

describe('mcp-stdio-bridge parseEventStream', function () {
  const { parseEventStream } = require('../lib/mcp-stdio-bridge.js');

  it('extracts JSON-RPC messages from SSE events, including multi-line and CRLF data', function () {
    const body = [
      'event: message',
      'id: 1',
      'data: {"jsonrpc":"2.0","method":"notifications/progress",',
      'data: "params":{"progress":1}}',
      '',
      ': keepalive comment',
      '',
      'data:{"jsonrpc":"2.0","id":7,"result":{}}',
      '',
    ].join('\r\n');
    expect(parseEventStream(body)).toEqual([
      { jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } },
      { jsonrpc: '2.0', id: 7, result: {} },
    ]);
  });

  it('keeps a final event that has no trailing blank line and skips unparseable ones', function () {
    const body = 'data: not json\n\ndata: {"jsonrpc":"2.0","id":1,"result":{}}';
    expect(parseEventStream(body)).toEqual([{ jsonrpc: '2.0', id: 1, result: {} }]);
  });
});

describe('mcp-stdio-bridge', function () {
  beforeEach(function () {
    this.configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mailspring-bridge-spec-'));
    fs.writeFileSync(
      path.join(this.configDir, 'config.json'),
      JSON.stringify({ '*': { core: { mcp: { enabled: true, port: PORT, token: TOKEN } } } })
    );
    this.server = new McpHttpServer();
    waitsForPromise(() => this.server.start(PORT, () => TOKEN));
  });

  afterEach(function () {
    waitsForPromise(() => this.server.stop());
    fs.rmSync(this.configDir, { recursive: true, force: true });
  });

  it('proxies initialize and tool calls over stdio', function () {
    waitsForPromise(async () => {
      const client = new BridgeClient(this.configDir);
      try {
        const init = await client.initialize();
        expect(init.result.serverInfo.name).toBe('mailspring');

        client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const { result } = await client.response(2);
        expect(result.tools.map((t) => t.name)).toContain('get_attachment');
      } finally {
        await client.close();
      }
    });
  });

  it('re-initializes transparently after the server restarts', function () {
    waitsForPromise(async () => {
      const client = new BridgeClient(this.configDir);
      try {
        await client.initialize();
        client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        expect((await client.response(2)).result).toBeDefined();

        // A fresh server has no record of the bridge's session.
        await this.server.stop();
        this.server = new McpHttpServer();
        await this.server.start(PORT, () => TOKEN);

        client.send({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
        const after = await client.response(3);
        expect(after.error).toBeUndefined();
        expect(after.result.tools.length).toBeGreaterThan(0);
        expect(client.stderr).toContain('re-initializing');
      } finally {
        await client.close();
      }
    });
  });

  it('answers requests with a JSON-RPC error while Mailspring is not listening', function () {
    waitsForPromise(async () => {
      const client = new BridgeClient(this.configDir);
      try {
        await client.initialize();
        await this.server.stop();

        client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const { error } = await client.response(2);
        expect(error.message).toContain('Mailspring is not running');
      } finally {
        await client.close();
      }
    });
  });

  it('fails fast with a clear error when the MCP server is disabled in config', function () {
    waitsForPromise(async () => {
      fs.writeFileSync(
        path.join(this.configDir, 'config.json'),
        JSON.stringify({ '*': { core: { mcp: { enabled: false, port: PORT, token: TOKEN } } } })
      );
      const client = new BridgeClient(this.configDir);
      try {
        const init = await client.initialize();
        expect(init.error.message).toContain('turned off');
      } finally {
        await client.close();
      }
    });
  });

  it('rejects batch requests and ignores non-object lines without exiting', function () {
    waitsForPromise(async () => {
      const client = new BridgeClient(this.configDir);
      try {
        await client.initialize();
        client.child.stdin.write('null\n5\n"text"\n');
        client.send([{ jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
        client.send({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
        expect((await client.response(3)).result).toBeDefined();
        const batchError = client.received.find((m) => m.id === null);
        expect(batchError.error.code).toBe(-32600);
        expect(client.child.exitCode).toBeNull();
      } finally {
        await client.close();
      }
    });
  });

  it('rejects the wrong token from a stale config without crashing', function () {
    waitsForPromise(async () => {
      fs.writeFileSync(
        path.join(this.configDir, 'config.json'),
        JSON.stringify({ '*': { core: { mcp: { port: PORT, token: 'wrong' } } } })
      );
      const client = new BridgeClient(this.configDir);
      try {
        const init = await client.initialize();
        expect(init.error).toBeDefined();
        expect(client.child.exitCode).toBeNull();
      } finally {
        await client.close();
      }
    });
  });
});
