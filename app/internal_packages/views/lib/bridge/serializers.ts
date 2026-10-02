import { Account, Category, Contact, File, Label, Message, Thread } from 'mailspring-exports';
import { isMessageAllowed, isThreadAllowed } from '../../../mcp-server/lib/capabilities/grant';
import type { ViewGrant } from './grant';

// Authorization + output shaping for everything that crosses the View bridge (shapes in
// docs/plans/views-api.md §3.6). The thread and message serializers return null when the
// grant excludes the model, so no call site can emit a model without passing the gate.
// Bodies are never part of a summary; they leave only through `messages.content`, which
// requires `mail.bodies`.

function iso(date: Date | null | undefined): string | null {
  return date && !isNaN(date.getTime()) ? date.toISOString() : null;
}

export function serializeContact(c: Contact) {
  return { name: c.name || '', email: c.email, isMe: c.isMe() };
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
    snippet: thread.snippet,
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
    snippet: message.snippet,
    date: iso(message.date),
    from: from ? serializeContact(from) : null,
    to: (message.to || []).map(serializeContact),
    cc: (message.cc || []).map(serializeContact),
    bcc: (message.bcc || []).map(serializeContact),
    isSent: message.isFromMe(),
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
