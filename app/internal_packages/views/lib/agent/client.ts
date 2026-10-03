import { IdentityStore, MailspringAPIRequest } from 'mailspring-exports';
import { AgentAPIError, AgentEvent, Example, ToolContent } from './types';

/**
 * Incremental parser for a `text/event-stream` body. Feed it decoded chunks as they arrive;
 * it returns the complete events found so far and keeps any partial one for the next chunk.
 */
export class SSEParser {
  private buffer = '';

  push(chunk: string): { id: string | null; event: string | null; data: string }[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const out = [];
    let boundary: number;
    while ((boundary = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      let id: string | null = null;
      let event: string | null = null;
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'id') id = value;
        else if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
      if (data.length) out.push({ id, event, data: data.join('\n') });
    }
    return out;
  }
}

export interface AgentTransport {
  createSession(body: {
    viewId: string;
    name: string;
    request: string;
    examples: Example[];
    current?: { manifest: object; files: { [name: string]: string } };
  }): Promise<{ viewId: string; sessionId: string; resumed: boolean }>;
  sendMessage(viewId: string, body: { text: string; examples?: Example[] }): Promise<void>;
  sendToolResult(
    viewId: string,
    body: { toolUseId: string; content: ToolContent[]; isError?: boolean }
  ): Promise<void>;
  interrupt(viewId: string): Promise<void>;
  budget(viewId: string, action: 'raise' | 'stop'): Promise<{ maxListCostCents: number }>;
  publicKey(): Promise<string>;
  /**
   * Streams the session's events until `signal` aborts. Reconnects with Last-Event-ID after a
   * dropped connection; events the client has already seen are skipped by id.
   */
  streamEvents(
    viewId: string,
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal,
    onOpen?: () => void
  ): Promise<void>;
}

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000, 10000];

function authorization() {
  const identity = IdentityStore.identity();
  if (!identity) {
    throw new AgentAPIError('Sign in with a Mailspring ID to build Views.', {
      code: 'no_identity',
    });
  }
  return `Basic ${btoa(`${identity.token}:`)}`;
}

async function errorFrom(resp: Response, desc: string) {
  let code = 'http_error';
  let message = `${desc} returned ${resp.status}`;
  let details = null;
  try {
    const json = await resp.json();
    if (json && json.error) {
      code = json.error.code || code;
      message = json.error.message || message;
      details = json.error;
    }
  } catch (err) {
    // Not JSON; keep the status-based message.
  }
  return new AgentAPIError(message, { statusCode: resp.status, code, details });
}

/** The authoring proxy on id.getmailspring.com (localhost:5101 when env is development). */
export class AgentClient implements AgentTransport {
  constructor(
    private root: () => string = () => MailspringAPIRequest.rootURLForServer('identity')
  ) {}

  private async request(method: 'GET' | 'POST', path: string, body?: object) {
    const desc = `${method} ${path}`;
    const headers = new Headers({ Accept: 'application/json', Authorization: authorization() });
    if (body) headers.set('Content-Type', 'application/json');
    let resp: Response;
    try {
      resp = await fetch(`${this.root()}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new AgentAPIError(`Couldn't reach the Mailspring servers (${desc}).`, {
        code: 'offline',
      });
    }
    if (!resp.ok) throw await errorFrom(resp, desc);
    return resp.json();
  }

  private sessionPath(viewId: string, rest = '') {
    return `/api/views/agent/sessions/${encodeURIComponent(viewId)}${rest}`;
  }

  createSession(body) {
    return this.request('POST', '/api/views/agent/sessions', body);
  }

  async sendMessage(viewId: string, body) {
    await this.request('POST', this.sessionPath(viewId, '/messages'), body);
  }

  async sendToolResult(viewId: string, body) {
    await this.request('POST', this.sessionPath(viewId, '/tool-results'), body);
  }

  async interrupt(viewId: string) {
    await this.request('POST', this.sessionPath(viewId, '/interrupt'), {});
  }

  budget(viewId: string, action: 'raise' | 'stop') {
    return this.request('POST', this.sessionPath(viewId, '/budget'), { action });
  }

  async publicKey() {
    const json = await this.request('GET', '/api/views/agent/public-key');
    return json.publicKey;
  }

  async streamEvents(
    viewId: string,
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal,
    onOpen?: () => void
  ) {
    let lastEventId: string | null = null;
    let failures = 0;
    while (!signal.aborted) {
      try {
        const headers = new Headers({
          Accept: 'text/event-stream',
          Authorization: authorization(),
        });
        if (lastEventId) headers.set('Last-Event-ID', lastEventId);
        const resp = await fetch(`${this.root()}${this.sessionPath(viewId, '/events')}`, {
          headers,
          signal,
        });
        if (!resp.ok) {
          const err = await errorFrom(resp, 'GET events');
          // Auth and missing-session failures won't fix themselves by reconnecting.
          if (resp.status >= 400 && resp.status < 500 && resp.status !== 408) throw err;
          throw Object.assign(err, { retryable: true });
        }
        failures = 0;
        if (onOpen) onOpen();
        const parser = new SSEParser();
        const decoder = new TextDecoder();
        const reader = resp.body.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const raw of parser.push(decoder.decode(value, { stream: true }))) {
            if (raw.id) lastEventId = raw.id;
            let event: AgentEvent;
            try {
              event = JSON.parse(raw.data);
            } catch (err) {
              continue;
            }
            if (!event.id && raw.id) (event as any).id = raw.id;
            onEvent(event);
          }
        }
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof AgentAPIError && !(err as any).retryable) throw err;
      }
      if (signal.aborted) return;
      const wait = RECONNECT_DELAYS_MS[Math.min(failures, RECONNECT_DELAYS_MS.length - 1)];
      failures += 1;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
