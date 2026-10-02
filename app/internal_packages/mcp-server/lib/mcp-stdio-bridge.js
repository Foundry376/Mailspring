/*
 * Stdio ↔ Streamable HTTP bridge between MCP clients that only speak stdio
 * (Claude Desktop) and Mailspring's MCP server.
 *
 * Claude Desktop runs this script with Mailspring's own Electron binary under
 * ELECTRON_RUN_AS_NODE=1, so the integration works on machines with no Node.js
 * installed. The script therefore depends on nothing but Node built-ins and is
 * plain CommonJS: Node executes it directly, and it is never loaded through
 * Mailspring's TypeScript compile hook.
 *
 * Usage: mcp-stdio-bridge.js --config-dir <Mailspring config directory>
 *
 * The port and bearer token are read from Mailspring's config.json on every
 * request, so regenerating the token or changing the port never leaves the
 * client with stale settings, and the token never has to be written into the
 * client's config file. When Mailspring restarts, its server forgets the HTTP
 * session; the bridge re-runs the initialize handshake and retries instead of
 * surfacing "Invalid or missing session" on every call until the client is
 * restarted.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const DEFAULT_PORT = 2587;
const HOST = '127.0.0.1';

// How long the initial `initialize` keeps retrying while Mailspring isn't
// listening. Covers Claude Desktop launching at login a few seconds before
// Mailspring's MCP server is up.
const CONNECT_RETRY_MS = 1000;
const CONNECT_RETRY_LIMIT = 20;

// Claude Desktop closes stdin when it shuts the server down; give in-flight
// requests and the session teardown this long before exiting regardless.
const SHUTDOWN_GRACE_MS = 2000;

const JSON_RPC_SERVER_ERROR = -32000;
const JSON_RPC_INVALID_REQUEST = -32600;

const NOT_RUNNING_MESSAGE =
  'Mailspring is not running, or its MCP server is disabled. Open Mailspring and check Preferences > MCP Server.';
const DISABLED_MESSAGE =
  'The Mailspring MCP server is turned off. Enable it in Mailspring under Preferences > MCP Server.';

// stderr is persisted by Claude Desktop, so never log more than a prefix of
// client or server payloads.
const LOG_EXCERPT_LENGTH = 200;

function log(message) {
  process.stderr.write(`[mailspring-mcp-bridge] ${message}\n`);
}

function excerpt(text) {
  return text.length > LOG_EXCERPT_LENGTH ? `${text.slice(0, LOG_EXCERPT_LENGTH)}…` : text;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config-dir') args.configDir = argv[++i];
  }
  return args;
}

function readServerSettings(configDir) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'));
  } catch (err) {
    throw new Error(`Could not read Mailspring's config.json in ${configDir}: ${err.message}`);
  }
  const mcp = (parsed['*'] && parsed['*'].core && parsed['*'].core.mcp) || {};
  if (!mcp.enabled || !mcp.token) {
    throw new Error(DISABLED_MESSAGE);
  }
  return { port: mcp.port || DEFAULT_PORT, token: mcp.token };
}

function writeToClient(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

// Parses a complete text/event-stream body into the JSON-RPC messages carried
// in its `data:` fields. Multi-line data is joined with "\n" per the SSE spec.
function parseEventStream(body) {
  const messages = [];
  let dataLines = [];
  const flush = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    dataLines = [];
    try {
      messages.push(JSON.parse(data));
    } catch {
      log(`Ignoring non-JSON SSE event: ${excerpt(data)}`);
    }
  };
  for (const line of body.split(/\r?\n/)) {
    if (line === '') {
      flush();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  flush();
  return messages;
}

function parseResponseBody(contentType, body) {
  if (body.trim() === '') return [];
  try {
    if (contentType.includes('text/event-stream')) return parseEventStream(body);
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function isConnectionError(err) {
  return err && ['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(err.code);
}

function isJsonRpcError(message) {
  return !!message && message.jsonrpc === '2.0' && typeof message.error === 'object';
}

function isRequest(message) {
  return message.id !== undefined && message.method !== undefined;
}

class Bridge {
  constructor(configDir) {
    this.configDir = configDir;
    this.sessionId = null;
    this.protocolVersion = null;
    // The client's original initialize params, replayed when the server
    // forgets our session (Mailspring restarted, or the server was toggled).
    this.initializeParams = null;
    this.reinitializing = null;
    this.reinitCount = 0;
  }

  // Async so a settings-read failure rejects instead of throwing synchronously.
  async request(method, body, { timeoutMs } = {}) {
    const { port, token } = readServerSettings(this.configDir);
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json, text/event-stream',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    if (this.protocolVersion) headers['MCP-Protocol-Version'] = this.protocolVersion;

    return new Promise((resolve, reject) => {
      const req = http.request({ host: HOST, port, path: '/mcp', method, headers }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            sessionId: res.headers['mcp-session-id'] || null,
            body: data,
            messages: parseResponseBody(res.headers['content-type'] || '', data),
          });
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('Request timed out')));
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  }

  post(message) {
    return this.request('POST', message);
  }

  // The server answers a request whose session it no longer knows with a 404
  // (MCP spec) or, from Mailspring's own routing, a 400 that names the session.
  isSessionLost(res) {
    if (res.status === 404) return true;
    return res.status === 400 && /session/i.test(res.body);
  }

  captureSession(res) {
    if (res.sessionId) this.sessionId = res.sessionId;
    const result = res.messages.find((m) => m && m.result && m.result.protocolVersion);
    if (result) this.protocolVersion = result.result.protocolVersion;
  }

  // Ends the current server session so the server doesn't accumulate
  // transports for sessions no client will use. Best-effort: the outcome
  // never matters to the caller.
  discardSession() {
    if (!this.sessionId) return Promise.resolve();
    const deleted = this.request('DELETE', undefined, { timeoutMs: 1000 }).catch(() => {});
    this.sessionId = null;
    this.protocolVersion = null;
    return deleted;
  }

  async postWithConnectRetry(message) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.post(message);
      } catch (err) {
        if (!isConnectionError(err) || attempt >= CONNECT_RETRY_LIMIT) throw err;
        if (attempt === 1) log('Mailspring MCP server is not reachable yet, waiting for it…');
        await new Promise((r) => setTimeout(r, CONNECT_RETRY_MS));
      }
    }
  }

  reinitialize() {
    if (!this.reinitializing) {
      this.reinitializing = this._reinitialize().finally(() => {
        this.reinitializing = null;
      });
    }
    return this.reinitializing;
  }

  async _reinitialize() {
    log('Session was lost (Mailspring restarted?) — re-initializing.');
    this.sessionId = null;
    this.protocolVersion = null;
    const id = `mailspring-bridge-reinit-${++this.reinitCount}`;
    const res = await this.post({
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: this.initializeParams,
    });
    if (res.status >= 400) {
      throw new Error(`Re-initialize failed with HTTP ${res.status}: ${excerpt(res.body)}`);
    }
    this.captureSession(res);
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }

  async forward(message) {
    if (message.method === 'initialize') {
      void this.discardSession();
      this.initializeParams = message.params;
      const res = await this.postWithConnectRetry(message);
      this.captureSession(res);
      return res;
    }
    const res = await this.post(message);
    if (this.isSessionLost(res) && this.initializeParams) {
      await this.reinitialize();
      return this.post(message);
    }
    return res;
  }

  // Relays the server's HTTP response to the client. A request must always
  // get exactly one response carrying its id, even when the server answered
  // with a bare HTTP error or with a stream that ended before responding.
  relayResponse(message, res) {
    if (res.status >= 400 && isRequest(message)) {
      const serverError = res.messages.find(isJsonRpcError);
      writeToClient({
        jsonrpc: '2.0',
        id: message.id,
        error: serverError
          ? serverError.error
          : {
              code: JSON_RPC_SERVER_ERROR,
              message: `Mailspring MCP server returned HTTP ${res.status}`,
            },
      });
      return;
    }
    let answered = false;
    for (const m of res.messages) {
      // Error responses to a request the server didn't accept carry a null
      // id; the client has no way to match those, so use the request's id.
      if (isJsonRpcError(m) && m.id === null && isRequest(message)) m.id = message.id;
      if (m && m.id === message.id) answered = true;
      writeToClient(m);
    }
    if (isRequest(message) && !answered) {
      writeToClient({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: JSON_RPC_SERVER_ERROR,
          message: 'No response from the Mailspring MCP server',
        },
      });
    }
  }

  async handleClientMessage(message) {
    try {
      this.relayResponse(message, await this.forward(message));
    } catch (err) {
      const text = isConnectionError(err) ? NOT_RUNNING_MESSAGE : err.message;
      log(`${message.method || 'message'} failed: ${text}`);
      if (isRequest(message)) {
        writeToClient({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: JSON_RPC_SERVER_ERROR, message: text },
        });
      }
    }
  }
}

// Claude Desktop sends one JSON-RPC object per line. Batches (arrays) are
// rejected rather than forwarded because session handling keys off a single
// `initialize` request.
function parseClientLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    log(`Ignoring malformed JSON from client: ${excerpt(line)}`);
    return null;
  }
  if (Array.isArray(message)) {
    writeToClient({
      jsonrpc: '2.0',
      id: null,
      error: { code: JSON_RPC_INVALID_REQUEST, message: 'Batch requests are not supported' },
    });
    return null;
  }
  if (!message || typeof message !== 'object') {
    log(`Ignoring non-object JSON from client: ${excerpt(line)}`);
    return null;
  }
  return message;
}

function main() {
  const { configDir } = parseArgs(process.argv.slice(2));
  if (!configDir) {
    log('Missing required --config-dir argument.');
    process.exit(1);
  }

  const bridge = new Bridge(configDir);
  const inFlight = new Set();
  let buffered = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffered += chunk;
    let newline;
    while ((newline = buffered.indexOf('\n')) !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (!line) continue;
      const message = parseClientLine(line);
      if (!message) continue;
      // Requests run concurrently. If several hit a lost session at once they
      // all wait on the same single-flight re-initialize, then retry.
      const task = bridge.handleClientMessage(message).finally(() => inFlight.delete(task));
      inFlight.add(task);
    }
  });

  const shutdown = () => {
    const drained = Promise.allSettled([...inFlight]).then(() => bridge.discardSession());
    const deadline = new Promise((r) => setTimeout(r, SHUTDOWN_GRACE_MS));
    Promise.race([drained, deadline]).finally(() => process.exit(0));
  };
  process.stdin.on('end', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  main();
}

module.exports = { parseEventStream };
