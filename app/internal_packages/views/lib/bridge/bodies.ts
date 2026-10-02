import { Actions, DatabaseStore, Message } from 'mailspring-exports';
import { isMessageAllowed } from '../../../mcp-server/lib/capabilities/grant';
import type { ViewGrant } from './grant';
import { bodyText, structuredData } from './content';

const BODY_FETCH_TIMEOUT_MS = 10 * 1000;
const BODY_POLL_INTERVAL_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadMessages(ids: string[]) {
  return DatabaseStore.findAll<Message>(Message)
    .where(Message.attributes.id.in(ids))
    .include(Message.attributes.body);
}

/**
 * Messages with their bodies, in the grant. Bodies the sync engine hasn't downloaded yet are
 * requested and waited for briefly; any still missing come back with a null body.
 */
export async function messagesWithBodies(grant: ViewGrant, ids: string[]) {
  let messages = (await loadMessages(ids)).filter((m) => isMessageAllowed(grant.scope, m));
  const missing = messages.filter((m) => m.body === null);
  if (missing.length) {
    Actions.fetchBodies(missing);
    const deadline = Date.now() + BODY_FETCH_TIMEOUT_MS;
    let stillMissing = missing.map((m) => m.id);
    while (stillMissing.length && Date.now() < deadline) {
      await delay(BODY_POLL_INTERVAL_MS);
      const reloaded = await loadMessages(stillMissing);
      const arrived = reloaded.filter((m) => m.body !== null);
      messages = messages.map((m) => arrived.find((a) => a.id === m.id) || m);
      stillMissing = stillMissing.filter((id) => !arrived.find((a) => a.id === id));
    }
  }
  return messages;
}

export interface ContentOpts {
  text?: boolean;
  html?: boolean;
  structured?: boolean;
  includeQuoted?: boolean;
}

export function contentFor(message: Message, opts: ContentOpts) {
  const out: { text?: string | null; html?: string | null; structured?: object[] } = {};
  const body = message.body;
  if (opts.text !== false) {
    out.text =
      body === null
        ? null
        : bodyText(body, { plaintext: message.plaintext, includeQuoted: !!opts.includeQuoted });
  }
  if (opts.html) out.html = body;
  if (opts.structured) out.structured = body === null ? [] : structuredData(body);
  return out;
}
