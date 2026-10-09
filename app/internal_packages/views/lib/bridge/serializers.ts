import {
  Account,
  Category,
  Contact,
  DatabaseStore,
  File,
  Label,
  Message,
  Thread,
} from 'mailspring-exports';
import { isMessageAllowed, isThreadAllowed } from '../../../mcp-server/lib/capabilities/grant';
import { isMyAddress } from '../../../mcp-server/lib/capabilities/identity';
import type { ViewGrant } from './grant';

// Authorization + output shaping for everything that crosses the View bridge. The thread and message serializers return null when the
// grant excludes the model, so no call site can emit a model without passing the gate.
// Bodies are never part of a summary; they leave only through `messages.content`, which
// requires `mail.bodies`.

function iso(date: Date | null | undefined): string | null {
  return date && !isNaN(date.getTime()) ? date.toISOString() : null;
}

// `Contact.isMe` only knows configured accounts and aliases; the identity also includes
// addresses the user has sent from, so old aliases don't show up as other people.
export function serializeContact(c: Contact) {
  return { name: c.name || '', email: c.email, isMe: c.isMe() || isMyAddress(c.email) };
}

export function serializeCategory(c: Category) {
  return {
    id: c.id,
    accountId: c.accountId,
    name: c.displayName || c.name,
    kind: c instanceof Label ? 'label' : 'folder',
    role: c.role || null,
  };
}

export function serializeAccount(account: Account, categories: Category[]) {
  return {
    id: account.id,
    label: account.label,
    email: account.emailAddress,
    provider: account.provider,
    categories: categories.map(serializeCategory),
  };
}

function serializeAttachment(f: File, messageId: string) {
  return {
    id: f.id,
    messageId,
    filename: f.displayName(),
    contentType: f.contentType || null,
    size: f.size,
    isInline: !!f.contentId,
  };
}

// `metadata.set(…, null)` stores `{}` because metadata rows can't be deleted, so an empty
// value reads back as no metadata.
function ownMetadata(grant: ViewGrant, model: Thread | Message) {
  const value = model.metadataForPluginId(grant.namespace);
  return value && Object.keys(value).length > 0 ? value : null;
}

export function serializeThreadSummary(grant: ViewGrant, thread: Thread) {
  if (!isThreadAllowed(grant.scope, thread)) return null;
  // The thread's participant list starts with the account owner on most threads; putting the
  // counterparties first means `participants[0]` is who the thread is "with".
  const participants = (thread.participants || []).map(serializeContact);
  participants.sort((a, b) => Number(a.isMe) - Number(b.isMe));

  return {
    id: thread.id,
    accountId: thread.accountId,
    subject: thread.subject,
    snippet: thread.snippet || null,
    unread: !!thread.unread,
    starred: !!thread.starred,
    participants,
    categories: (thread.categories || []).map(serializeCategory),
    attachmentCount: thread.attachmentCount || 0,
    firstMessageAt: iso(thread.firstMessageTimestamp),
    lastReceivedAt: iso(thread.lastMessageReceivedTimestamp),
    lastSentAt: iso(thread.lastMessageSentTimestamp),
    meta: ownMetadata(grant, thread),
  };
}

export function serializeMessageSummary(grant: ViewGrant, message: Message) {
  if (!isMessageAllowed(grant.scope, message)) return null;
  const from = message.from && message.from[0];
  return {
    id: message.id,
    threadId: message.threadId,
    accountId: message.accountId,
    subject: message.subject,
    snippet: message.snippet || null,
    date: iso(message.date),
    from: from ? serializeContact(from) : null,
    to: (message.to || []).map(serializeContact),
    cc: (message.cc || []).map(serializeContact),
    bcc: (message.bcc || []).map(serializeContact),
    isSent: message.isFromMe() || !!(from && isMyAddress(from.email)),
    unread: !!message.unread,
    starred: !!message.starred,
    draft: !!message.draft,
    categories: message.categories().map(serializeCategory),
    attachments: (message.files || []).map((f) => serializeAttachment(f, message.id)),
    // The only list header the sync engine persists (with Importance, which isn't exposed).
    listUnsubscribe: message.listUnsubscribe || null,
    meta: ownMetadata(grant, message),
  };
}

export type ThreadSummary = ReturnType<typeof serializeThreadSummary>;
export type MessageSummary = ReturnType<typeof serializeMessageSummary>;

/**
 * Threads have no stored snippet; the thread list shows the newest message snippet, so this
 * does the same with one query. Message snippets exist only once the body has been fetched,
 * so some threads keep `snippet: null`.
 */
export async function fillThreadSnippets(items: ThreadSummary[]) {
  const missing = items.filter((t) => t && !t.snippet).map((t) => t.id);
  if (missing.length === 0) return items;
  const ids = missing.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
  const rows = await (DatabaseStore as any)._query(
    "SELECT `threadId`, json_extract(`data`, '$.snippet') AS `snippet` FROM `Message` " +
      `WHERE \`threadId\` IN (${ids}) AND \`draft\` = 0 ` +
      "AND json_extract(`data`, '$.snippet') IS NOT NULL ORDER BY `date` ASC",
    [],
    true
  );
  const latest = new Map<string, string>();
  for (const row of rows) latest.set(row.threadId, row.snippet);
  for (const t of items) if (t && !t.snippet) t.snippet = latest.get(t.id) || null;
  return items;
}
