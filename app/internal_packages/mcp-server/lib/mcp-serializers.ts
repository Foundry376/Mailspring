import type { Thread, Message, Category, Contact } from 'mailspring-exports';
import { isThreadAllowed, isMessageAllowed } from './mcp-access-control';

// Authorization + output-shaping, combined. Every thread/message that leaves
// this process for an MCP client passes through one of these functions,
// which return `null` when the underlying model fails the account/folder
// access-control check — that makes it structurally impossible to add a new
// output field (or a new call site) without it also passing through the
// authorization gate.

function serializeCategory(c: Category) {
  return { id: c.id, name: c.displayName || c.name };
}

function serializeContact(c: Pick<Contact, 'name' | 'email'>) {
  return { name: c.name, email: c.email };
}

export function serializeThreadSummary(
  thread: Thread,
  opts: { includeMessageCount?: boolean } = {}
): Record<string, any> | null {
  if (!isThreadAllowed(thread)) return null;
  const summary: Record<string, any> = {
    id: thread.id,
    subject: thread.subject,
    snippet: thread.snippet,
    unread: thread.unread,
    starred: thread.starred,
    lastMessageReceivedTimestamp: thread.lastMessageReceivedTimestamp,
    participantCount: thread.participants?.length || 0,
    accountId: thread.accountId,
    categories: (thread.categories || []).map(serializeCategory),
  };
  if (opts.includeMessageCount) {
    summary.messageCount = (thread as any).messageCount || null;
  }
  return summary;
}

export function serializeMessageDetail(message: Message): Record<string, any> | null {
  if (!isMessageAllowed(message)) return null;
  return {
    id: message.id,
    headerMessageId: message.headerMessageId,
    threadId: message.threadId,
    from: message.from?.map(serializeContact),
    to: message.to?.map(serializeContact),
    cc: message.cc?.map(serializeContact),
    bcc: message.bcc?.map(serializeContact),
    subject: message.subject,
    date: message.date,
    body: message.body,
    snippet: message.snippet,
    unread: message.unread,
    starred: message.starred,
    draft: message.draft,
    replyToHeaderMessageId: message.replyToHeaderMessageId,
    accountId: message.accountId,
  };
}

export function serializeThreadDetail(
  thread: Thread,
  messages: Message[]
): Record<string, any> | null {
  if (!isThreadAllowed(thread)) return null;
  return {
    id: thread.id,
    subject: thread.subject,
    unread: thread.unread,
    starred: thread.starred,
    accountId: thread.accountId,
    lastMessageReceivedTimestamp: thread.lastMessageReceivedTimestamp,
    categories: (thread.categories || []).map(serializeCategory),
    // Folder-excluded messages within an otherwise-allowed thread are
    // dropped here rather than surfaced with a placeholder, matching the
    // "don't confirm existence of excluded data" posture used everywhere
    // else in this package.
    messages: messages
      .map(serializeMessageDetail)
      .filter((m): m is Record<string, any> => m !== null),
  };
}
