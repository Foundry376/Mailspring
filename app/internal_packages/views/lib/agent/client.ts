import { z } from 'zod';
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

/** The fields the client reads from `POST /api/views/agent/sessions`. */
const CreatedSessionSchema = z.object({ resumed: z.boolean() });
export type CreatedSession = z.infer<typeof CreatedSessionSchema>;

/** The reply to `POST .../budget`. The cap is null when a stopped session never had one. */
const BudgetChangeSchema = z.object({ maxListCostCents: z.number().nullable() });
export type BudgetChange = z.infer<typeof BudgetChangeSchema>;

/** The protocol's error body, `{ error: { code, message, ...details } }`. */
const ErrorReplySchema = z.object({
  error: z.looseObject({ code: z.string().optional(), message: z.string().optional() }),
});

export interface AgentTransport {
  createSession(body: {
    viewId: string;
    name: string;
    request: string;
    examples: Example[];
    current?: { manifest: object; files: { [name: string]: string } };
    /** Replace the View's current session instead of resuming it (after `session_turn_limit`). */
    fresh?: boolean;
  }): Promise<CreatedSession>;
  sendMessage(viewId: string, body: { text: string; examples?: Example[] }): Promise<void>;
  sendToolResult(
    viewId: string,
    body: { toolUseId: string; content: ToolContent[]; isError?: boolean }
  ): Promise<void>;
  interrupt(viewId: string): Promise<void>;
  budget(viewId: string, action: 'raise' | 'stop'): Promise<BudgetChange>;
  /** The account's View-building allowance and what it has used, unvalidated (see parseUsage). */
  usage(): Promise<unknown>;
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
    const parsed = ErrorReplySchema.safeParse(await resp.json());
    if (parsed.success) {
      code = parsed.data.error.code || code;
      message = parsed.data.error.message || message;
      details = parsed.data.error;
    }
  } catch (err) {
    // Not JSON; keep the status-based message.
  }
  return new AgentAPIError(message, { statusCode: resp.status, code, details });
}

/** `json` as `schema` describes it, or a `malformed_response` error naming the request. */
export function parseReply<T extends z.ZodType>(
  schema: T,
  json: unknown,
  desc: string
): z.infer<T> {
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AgentAPIError(`The Mailspring servers sent an unexpected reply to ${desc}.`, {
      code: 'malformed_response',
    });
  }
  return parsed.data;
}

/**
 * One JSON request to the identity server's Views API. `auth: false` is for the public routes
 * (a shared View's install sheet), which must work before the user signs in.
 */
export async function requestJSON(
  root: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: object,
  { auth = true } = {}
) {
  const desc = `${method} ${path}`;
  const headers = new Headers({ Accept: 'application/json' });
  if (auth) headers.set('Authorization', authorization());
  if (body) headers.set('Content-Type', 'application/json');
  let resp: Response;
  try {
    resp = await fetch(`${root}${path}`, {
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

/** The authoring proxy on id.getmailspring.com (localhost:5101 when env is development). */
export class AgentClient implements AgentTransport {
  constructor(
    private root: () => string = () => MailspringAPIRequest.rootURLForServer('identity')
  ) {}

  private request(method: 'GET' | 'POST', path: string, body?: object) {
    return requestJSON(this.root(), method, path, body);
  }

  private sessionPath(viewId: string, rest = '') {
    return `/api/views/agent/sessions/${encodeURIComponent(viewId)}${rest}`;
  }

  async createSession(body) {
    const json = await this.request('POST', '/api/views/agent/sessions', body);
    return parseReply(CreatedSessionSchema, json, 'the new session request');
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

  async budget(viewId: string, action: 'raise' | 'stop') {
    const json = await this.request('POST', this.sessionPath(viewId, '/budget'), { action });
    return parseReply(BudgetChangeSchema, json, 'the budget request');
  }

  usage() {
    return this.request('GET', '/api/views/agent/usage');
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
